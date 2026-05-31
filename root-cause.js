const {PrismaClient}=require('/opt/wms/server/node_modules/@prisma/client');
const p=new PrismaClient();
(async()=>{
  var c=await p.contract.create({data:{contractNo:'ROOTCAUSE-'+Date.now(),customerId:32,businessCustomerId:2}});
  console.log('1. Prisma createdAt:',c.createdAt,'Date?',c.createdAt instanceof Date);
  var raw=await p.$queryRawUnsafe('SELECT createdAt, typeof(createdAt) as t FROM Contract WHERE id=?',c.id);
  console.log('2. Raw SQLite:',JSON.stringify(raw[0]));
  var old=await p.$queryRawUnsafe('SELECT createdAt, typeof(createdAt) as t FROM Contract WHERE id=14');
  console.log('3. Old contract:',JSON.stringify(old[0]));
  var all=await p.contract.findMany({where:{customerId:32},orderBy:{createdAt:'desc'},take:5,select:{id:true,contractNo:true,createdAt:true}});
  console.log('4. orderBy desc:');
  all.forEach(x=>console.log('  id:',x.id,x.contractNo,'date:',x.createdAt));
  await p.contract.delete({where:{id:c.id}});
  await p.$disconnect();
})();
