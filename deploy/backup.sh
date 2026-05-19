#!/bin/bash
BACKUP_DIR=/opt/wms/backups
DB=/opt/wms/server/prisma/dev.db
RETENTION_DAYS=7

mkdir -p $BACKUP_DIR

# WAL checkpoint: 把 WAL 数据刷入主库，确保备份完整
# 凌晨2点执行，几乎无并发用户，TRUNCATE 也是毫秒级完成
sqlite3 $DB "PRAGMA wal_checkpoint(TRUNCATE)" > /dev/null 2>&1

cp $DB $BACKUP_DIR/wms-$(date +%Y%m%d-%H%M%S).db
gzip $BACKUP_DIR/wms-*.db 2>/dev/null
find $BACKUP_DIR -name '*.db.gz' -mtime +$RETENTION_DAYS -delete

echo "$(date): Backup done, size: $(du -sh $BACKUP_DIR | cut -f1)"
