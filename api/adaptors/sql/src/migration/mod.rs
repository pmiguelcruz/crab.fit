pub use sea_orm_migration::prelude::*;

mod m01_setup_tables;
mod m02_mysql_datetimes;
mod m03_slot_size;
mod m04_tentative;
mod m05_event_groups;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m01_setup_tables::Migration),
            Box::new(m02_mysql_datetimes::Migration),
            Box::new(m03_slot_size::Migration),
            Box::new(m04_tentative::Migration),
            Box::new(m05_event_groups::Migration),
        ]
    }
}
