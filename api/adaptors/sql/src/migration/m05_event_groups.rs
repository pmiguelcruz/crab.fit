use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager.has_column("event", "groups").await? {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new("event"))
                        .add_column(ColumnDef::new(Alias::new("groups")).json())
                        .to_owned(),
                )
                .await?;
        }
        if !manager.has_column("person", "group_id").await? {
            manager
                .alter_table(
                    Table::alter()
                        .table(Alias::new("person"))
                        .add_column(ColumnDef::new(Alias::new("group_id")).string_len(12))
                        .to_owned(),
                )
                .await?;
        }
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        for (table, column) in [("person", "group_id"), ("event", "groups")] {
            if manager.has_column(table, column).await? {
                manager
                    .alter_table(
                        Table::alter()
                            .table(Alias::new(table))
                            .drop_column(Alias::new(column))
                            .to_owned(),
                    )
                    .await?;
            }
        }
        Ok(())
    }
}
