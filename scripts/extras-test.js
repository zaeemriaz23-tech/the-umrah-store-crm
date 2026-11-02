const { spawn } = require('child_process'); const fs=require('fs'), os=require('os'), path=require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-')), PORT = 3700+Math.floor(Math.random()*90), B='http://127.0.0.1:'+PORT;
class C{constructor(){this.c=''} async req(m,u,b){const r=await fetch(B+u,{method:m,headers:{'content-type':'application/json',cookie:this.c},body:b?JSON.stringify(b):undefined});const sc=r.headers.get('set-cookie');if(sc)this.c=sc.split(';')[0];return{s:r.status,j:await r.json().catch(()=>({}))}} login(l,p){return this.req('POST','/api/login',{login:l,password:p})} rpc(o,p){return this.req('POST','/api/rpc',{op:o,...p})} get(u){return this.req('GET',u)}}
let pass=0,fail=0;const ok=(c,m)=>{c?pass++:fail++;console.log(c?'PASS':'FAIL',m)};
(async()=>{
 const srv=spawn('node',['server.js'],{env:{...process.env,PORT,DATA_DIR:dir,ADMIN_PASSWORD:'AdminPass#1'},stdio:['ignore','pipe','inherit']}); await new Promise(r=>srv.stdout.on('data',()=>r()));
 const A=new C(); await A.login('admin','AdminPass#1');
 const ag=(await A.rpc('saveParty',{kind:'agent',name:'Ag One',limit:1e7})).j.id, sup=(await A.rpc('saveParty',{kind:'supplier',name:'Sup One'})).j.id;
 await A.rpc('saveUser',{}).catch(()=>{});
 // create agent+supplier logins
 const r1=await A.rpc('saveParty',{id:ag,kind:'agent',name:'Ag One',limit:1e7,login:'agent1',password:'AgentPass#1'}); 
 const r2=await A.rpc('saveParty',{id:sup,kind:'supplier',name:'Sup One',login:'sup1',password:'SupPass#1'});
 const AG=new C(), SU=new C(); ok((await AG.login('agent1','AgentPass#1')).s===200,'agent login'); ok((await SU.login('sup1','SupPass#1')).s===200,'supplier login');
 // agent books -> admin notified
 const bk=(await AG.rpc('saveBooking',{category:'Custom',pax:[{n:'Test Pax',pp:'AB1234567'}],services:[{type:'hotel',title:'Hotel X',sell:1000,qty:1,from:'2030-01-01',to:'2030-01-05'}]})).j;
 ok(!!bk.id,'agent creates booking ('+JSON.stringify(bk).slice(0,60)+')');
 let st=(await A.get('/api/state')).j; ok(st.notifs.items.some(n=>/awaiting approval/.test(n.title)),'admin notified of new pending booking');
 await A.rpc('setStatus',{id:bk.id,status:'Confirmed'});
 let sa=(await AG.get('/api/state')).j; ok(sa.notifs.items.some(n=>/approved/i.test(n.title)),'agent notified of approval'); ok(sa.notifs.unread>=1,'agent unread count');
 await AG.rpc('markNotifs',{all:true}); sa=(await AG.get('/api/state')).j; ok(sa.notifs.unread===0,'mark all read');
 ok(!sa.notifs.items.some(n=>/awaiting approval/.test(n.title)),'agent does not see staff notifications');
 // payment flow
 await AG.rpc('addPayment',{amt:5000,method:'Bank transfer',ref:'R1'}); st=(await A.get('/api/state')).j; ok(st.notifs.items.some(n=>/Payment awaiting/.test(n.title)),'staff notified of pending payment');
 const pay=st.payments.find(p=>p.status==='Pending'); await A.rpc('approvePayment',{id:pay.id}); sa=(await AG.get('/api/state')).j; ok(sa.notifs.items.some(n=>/Payment received/.test(n.title)),'agent notified payment received');
 // tickets
 const t=(await AG.rpc('openTicket',{subject:'Voucher issue',text:'Cannot open voucher',category:'Voucher',priority:'High',bookingNo:bk.no})).j; ok(!!t.id&&/^TK-/.test(t.no),'agent opens ticket '+t.no);
 const ts=(await SU.rpc('openTicket',{subject:'Conf no',text:'Need help here'})).j; ok(!!ts.id,'supplier opens ticket');
 st=(await A.get('/api/state')).j; ok(st.tickets.length===2,'admin sees both tickets'); ok(st.notifs.items.some(n=>/New support ticket/.test(n.title)),'admin notified of ticket');
 sa=(await AG.get('/api/state')).j; ok(sa.tickets.length===1&&sa.tickets[0].id===t.id,'agent only sees own ticket');
 const su=(await SU.get('/api/state')).j; ok(su.tickets.length===1&&su.tickets[0].id===ts.id,'supplier only sees own ticket');
 ok((await AG.rpc('replyTicket',{id:ts.id,text:'hack'})).s===400,'agent cannot reply to others ticket');
 await A.rpc('replyTicket',{id:t.id,text:'Internal: check voucher',internal:true}); sa=(await AG.get('/api/state')).j; ok(sa.tickets[0].msgs.length===1,'internal note hidden from agent');
 await A.rpc('replyTicket',{id:t.id,text:'We fixed it'}); sa=(await AG.get('/api/state')).j; ok(sa.tickets[0].status==='Answered'&&sa.notifs.items.some(n=>/Support replied/.test(n.title)),'staff reply -> Answered + agent notified');
 await AG.rpc('replyTicket',{id:t.id,text:'Thanks'}); st=(await A.get('/api/state')).j; ok(st.tickets.find(x=>x.id===t.id).status==='Open','agent reply reopens');
 await AG.rpc('setTicketStatus',{id:t.id,status:'Closed'}); ok((await A.get('/api/state')).j.tickets.find(x=>x.id===t.id).status==='Closed','agent closes ticket');
 ok((await AG.rpc('setTicketMeta',{id:t.id,priority:'Low'})).s>=400,'agent cannot change priority'); ok((await AG.rpc('delTicket',{id:t.id})).s>=400,'agent cannot delete');
 // staff without support perm
 const roles=st.rbac.roles; const mk=await A.rpc('staffSave',{login:'ops1',password:'Staff#Pass1',name:'ops1'}); await A.rpc('staffSetAccess',{id:mk.j.id,roleIds:[roles.find(r=>r.name==='Operations Executive').id]});
 const OP=new C(); await OP.login('ops1','Staff#Pass1'); const so=(await OP.get('/api/state')).j; ok(so.tickets.length===0,'staff without support.view gets no tickets'); ok((await OP.rpc('replyTicket',{id:ts.id,text:'x'})).s===403,'staff without perm cannot reply'); ok(!so.notifs.items.some(n=>/ticket/i.test(n.title)),'staff without perm not notified of tickets');
 // fx
 const fx=(await AG.get('/api/fx')).j; ok(fx.configured===false&&fx.base==='PKR','fx without key reports not configured'); 
 await A.rpc('saveSettings',{serpapiKey:'dummy'}); const fx2=(await AG.get('/api/fx')).j; ok(fx2.configured===true&&typeof fx2.error==='string','fx with key attempts fetch (error expected offline): '+fx2.error.slice(0,50));
 ok((await new C().get('/api/fx')).s===401,'fx requires login');
 console.log(pass+' passed, '+fail+' failed'); srv.kill('SIGTERM'); process.exit(fail?1:0);
})();
