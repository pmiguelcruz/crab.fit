use sea_orm_migration::{prelude::*, sea_orm::DbBackend};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager.get_database_backend() == DbBackend::MySql {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new("event"))
                        .modify_column(
                            ColumnDef::new(Alias::new("created_at"))
                                .date_time()
                                .not_null(),
                        )
                        .modify_column(
                            ColumnDef::new(Alias::new("visited_at"))
                                .date_time()
                                .not_null(),
                        )
                        .to_owned(),
                )
                .await?;
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new("person"))
                        .modify_column(
                            ColumnDef::new(Alias::new("created_at"))
                                .date_time()
                                .not_null(),
                        )
                        .to_owned(),
                )
                .await?;
        }
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager.get_database_backend() == DbBackend::MySql {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new("event"))
                        .modify_column(
                            ColumnDef::new(Alias::new("created_at"))
                                .timestamp()
                                .not_null(),
                        )
                        .modify_column(
                            ColumnDef::new(Alias::new("visited_at"))
                                .timestamp()
                                .not_null(),
                        )
                        .to_owned(),
                )
                .await?;
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new("person"))
                        .modify_column(
                            ColumnDef::new(Alias::new("created_at"))
                                .timestamp()
                                .not_null(),
                        )
                        .to_owned(),
                )
                .await?;
        }
        Ok(())
    }
}
