pub use sea_orm_migration::prelude::*;

mod m01_setup_tables;
mod m02_mysql_datetimes;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m01_setup_tables::Migration),
            Box::new(m02_mysql_datetimes::Migration),
        ]
    }
}
