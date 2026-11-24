use std::{env, net::SocketAddr, sync::Arc};

use axum::{
    error_handling::HandleErrorLayer,
    extract,
    http::{
        header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE},
        HeaderValue, Method,
    },
    routing::{get, patch, post},
    BoxError, Router, Server,
};
use routes::*;
use tokio::sync::Mutex;
use tower::ServiceBuilder;
use tower_governor::{errors::display_error, governor::GovernorConfigBuilder, GovernorLayer};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::Level;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use crate::adaptors::create_adaptor;
use crate::docs::ApiDoc;

mod adaptors;
mod docs;
mod errors;
mod payloads;
mod routes;
mod sessions;

pub struct ApiState<A> {
    adaptor: A,
    sessions: sessions::Sessions,
    admin_pin: sessions::AdminPin,
}

pub type State<A> = extract::State<Arc<Mutex<ApiState<A>>>>;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_max_level(Level::INFO).init();

    // Load env
    dotenvy::dotenv().ok();

    let shared_state = Arc::new(Mutex::new(ApiState {
        adaptor: create_adaptor().await,
        sessions: sessions::Sessions::default(),
        admin_pin: sessions::AdminPin::new(env::var("ADMIN_PIN").ok()),
    }));

    // CORS configuration
    let cors = CorsLayer::new()
        .allow_credentials(true)
        .allow_headers([AUTHORIZATION, ACCEPT, CONTENT_TYPE])
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE])
        .allow_origin(
            env::var("FRONTEND_URL")
                .unwrap_or_else(|_| {
                    if cfg!(debug_assertions) {
                        "http://localhost:1234".to_owned()
                    } else {
                        panic!("Missing FRONTEND_URL environment variable")
                    }
                })
                .parse::<HeaderValue>()
                .expect("Invalid FRONTEND_URL"),
        );

    // Rate limiting configuration (using tower_governor)
    // From the docs: Allows bursts with up to 20 requests and replenishes
    // one element after 500ms, based on peer IP.
    let governor_config = Box::new(
        GovernorConfigBuilder::default()
            .burst_size(20)
            .finish()
            .unwrap(),
    );
    let rate_limit = ServiceBuilder::new()
        // Handle errors from governor and convert into HTTP responses
        .layer(HandleErrorLayer::new(|e: BoxError| async move {
            display_error(e)
        }))
        .layer(GovernorLayer {
            config: Box::leak(governor_config),
        });

    let app = Router::new()
        .merge(SwaggerUi::new("/docs").url("/docs/openapi.json", ApiDoc::openapi()))
        .route("/", get(get_root))
        .route("/stats", get(stats::get_stats))
        .route("/admin/session", post(admin::login).delete(admin::logout))
        .route("/admin/events", get(admin::list_events))
        .route(
            "/admin/events/:id",
            patch(admin::update_event).delete(admin::delete_event),
        )
        .route("/admin/events/:id/people", get(admin::list_people))
        .route(
            "/admin/events/:id/people/:name",
            axum::routing::delete(admin::delete_person),
        )
        .route("/event", post(event::create_event))
        .route("/event/:event_id", get(event::get_event))
        .route("/event/:event_id/people", get(person::get_people))
        .route(
            "/event/:event_id/people/:person_name",
            get(person::get_person),
        )
        .route(
            "/event/:event_id/people/:person_name",
            patch(person::update_person).delete(person::delete_person),
        )
        .route("/tasks/cleanup", get(tasks::cleanup))
        .with_state(shared_state)
        .layer(cors)
        .layer(rate_limit)
        .layer(TraceLayer::new_for_http());

    let addr: SocketAddr = env::var("LISTEN_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:3000".to_owned())
        .parse()
        .expect("LISTEN_ADDR must be an IP address and port, e.g. 127.0.0.1:3000");

    println!(
        "🦀 Crab Fit API listening at http://{} in {} mode",
        addr,
        if cfg!(debug_assertions) {
            "debug"
        } else {
            "release"
        }
    );
    Server::bind(&addr)
        .serve(app.into_make_service_with_connect_info::<SocketAddr>())
        .with_graceful_shutdown(async {
            tokio::signal::ctrl_c()
                .await
                .expect("Failed to install Ctrl+C handler")
        })
        .await
        .unwrap();
}

async fn get_root() -> String {
    format!("Crab Fit API v{}", env!("CARGO_PKG_VERSION"))
}
