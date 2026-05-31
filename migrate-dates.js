const {PrismaClient}=require('/opt/wms/server/node_modules/@prisma/client');
const p=new PrismaClient();

async function convert(table, cols) {
  const records = await p.$queryRawUnsafe(`SELECT id, ${cols} FROM ${table} WHERE typeof(${cols[0]})='text'`);
  if (!records.length) { console.log(`${table}: no text dates`); return 0; }
  for (const row of records) {
    const sets = cols.map(c => `${c}=${new Date(row[c]).getTime()}`).join(',');
    await p.$queryRawUnsafe(`UPDATE ${table} SET ${sets} WHERE id=?`, row.id);
  }
  console.log(`${table}: converted ${records.length} records`);
  return records.length;
}

(async()=>{
  console.log('Migrating text dates to integers (Prisma 6 format)...\n');
  await convert('Contract', ['createdAt','updatedAt']);
  await convert('Container', ['createdAt','updatedAt']);
  await convert('OutboundOrder', ['createdAt']);
  await convert('InboundOrder', ['createdAt']);
  await convert('StockLog', ['createdAt']);
  await convert('Product', ['createdAt','updatedAt']);
  await convert('Customer', ['createdAt']);
  await convert('User', ['createdAt']);
  await convert('Warehouse', ['createdAt']);
  await convert('TransferOrder', ['createdAt']);
  await convert('CheckTask', ['createdAt']);
  console.log('\nDone. Verifying...');
  const c=await p.$queryRawUnsafe("SELECT COUNT(*) as cnt FROM Contract WHERE typeof(createdAt)='text'");
  console.log('Text contracts remaining:',Number(c[0].cnt));
  await p.$disconnect();
})();
