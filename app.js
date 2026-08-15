(function(){
  'use strict';
  var DB_KEY='silah_live_v1_db';
  var SESSION_KEY='silah_live_v1_session';
  var FILE_DB='silah_live_v1_files';
  var db=loadDB();
  var session=loadSession();
  var active='dashboard';
  var authMode='login';
  var authBusy=false;
  var toastTimer;
  var cloudRefreshTimer;

  function $(id){return document.getElementById(id)}
  function baseDB(){return {version:3,profiles:[],rfqs:[],quotes:[],pos:[],ratings:[],credits:[],disputes:[],activity:[],counters:{rfq:0,quote:0,po:0}}}
  function normalize(x){
    var b=baseDB();
    if(!x||typeof x!=='object')return b;
    Object.keys(b).forEach(function(k){if(x[k]!==undefined)b[k]=x[k]});
    ['profiles','rfqs','quotes','pos','ratings','credits','disputes','activity'].forEach(function(k){if(!Array.isArray(b[k]))b[k]=[]});
    if(!b.counters||typeof b.counters!=='object')b.counters={rfq:b.rfqs.length,quote:b.quotes.length,po:b.pos.length};
    ['rfq','quote','po'].forEach(function(k){if(typeof b.counters[k]!=='number')b.counters[k]=0});
    b.profiles.forEach(function(p){
      if(!p.docs||typeof p.docs!=='object')p.docs={commercial:false,tax:false,signer:false};
      if(!p.documentData||typeof p.documentData!=='object')p.documentData={};
    });
    b.rfqs.forEach(function(r){if(!Array.isArray(r.items))r.items=[];if(!Array.isArray(r.attachments))r.attachments=[];r.attachments.forEach(function(f,i){if(!f.id)f.id='legacy-rfq-'+r.id+'-'+i});delete r.type});
    b.quotes.forEach(function(q){if(!Array.isArray(q.items))q.items=[];if(!Array.isArray(q.attachments))q.attachments=[];q.attachments.forEach(function(f,i){if(!f.id)f.id='legacy-quote-'+q.id+'-'+i})});
    b.pos.forEach(function(p){
      if(p.status==='تم التسليم')p.status='بانتظار تأكيد استلام العميل';
      if(p.status==='مستلم من العميل')p.status='مكتمل';
      if(!Array.isArray(p.history))p.history=[];
    });
    b.version=3;
    return b;
  }
  function loadDB(){try{return normalize(JSON.parse(localStorage.getItem(DB_KEY)))}catch(e){return baseDB()}}
  function loadSession(){try{var x=JSON.parse(localStorage.getItem(SESSION_KEY));return x&&x.email&&x.role?x:null}catch(e){return null}}
  function cacheDB(){localStorage.setItem(DB_KEY,JSON.stringify(db))}
  function save(){cacheDB();render()}
  function uid(p){return p+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7)}
  function now(){return new Date().toISOString()}
  function esc(v){return String(v===undefined||v===null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function money(v){return new Intl.NumberFormat('ar-EG',{style:'currency',currency:'EGP',maximumFractionDigits:0}).format(Number(v||0))}
  function smallMoney(v){return new Intl.NumberFormat('ar-EG',{maximumFractionDigits:0}).format(Number(v||0))+' ج.م'}
  function date(v){if(!v)return '—';var d=new Date(v);return isNaN(d)?esc(v):d.toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'})}
  function time(v){if(!v)return '—';var d=new Date(v);return isNaN(d)?esc(v):d.toLocaleString('ar-EG',{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
  function roleName(r){return r==='buyer'?'العميل / المشتريات':r==='supplier'?'المورد':'إدارة صِلَة'}
  function profile(email,role){return db.profiles.find(function(p){return p.email===email&&p.role===role})}
  function me(){return session?profile(session.email,session.role):null}
  function pFor(email,role){return profile(email,role)||{email:email,role:role,company:email,name:email,verification:'غير مكتمل',rating:0,financial:0,operational:0,docs:{}}}
  function nameOf(email,role){var p=pFor(email,role);return p.company||p.name||email}
  function docs(p){return p&&p.docs?p.docs:{commercial:false,tax:false,signer:false}}
  function documentData(p){return p&&p.documentData?p.documentData:{}}
  function documentFile(p,key){return documentData(p)[key+'File']||null}
  function documentValue(p,key){var d=documentData(p);if(key==='commercial')return d.commercialNumber||'';if(key==='tax')return d.taxNumber||'';return [d.signerName||'',d.signerTitle||''].filter(Boolean).join(' — ')}
  function documentChips(p){var d=docs(p);return '<div class="docs"><span class="doc '+(d.commercial?'ok':'')+'">تجاري '+(d.commercial?'✓':'—')+'</span><span class="doc '+(d.tax?'ok':'')+'">ضريبي '+(d.tax?'✓':'—')+'</span><span class="doc '+(d.signer?'ok':'')+'">مفوض '+(d.signer?'✓':'—')+'</span></div>'}
  function documentPanel(p){
    var d=docs(p),items=[['commercial','السجل التجاري','رقم السجل'],['tax','البطاقة الضريبية','الرقم الضريبي'],['signer','المفوض بالتوقيع','الاسم والصفة']];
    return '<div class="verification-grid">'+items.map(function(item){var key=item[0],f=documentFile(p,key),value=documentValue(p,key),state=d[key]?'متوفر':'غير مكتمل',actions=f?'<div class="actions" style="margin-top:7px">'+cmd('openAttachment',f.id,'فتح الملف','soft')+cmd('downloadAttachment',f.id,'تنزيل','ghost')+'</div>':'';return '<div class="verification-item"><div class="card-row"><b>'+item[1]+'</b>'+status(state)+'</div><small class="muted">'+item[2]+': '+esc(value||'—')+'</small>'+actions+'</div>'}).join('')+'</div>';
  }
  function complete(p){return !!(p&&(p.role==='admin'||p.company&&p.contact&&p.phone&&p.city))}
  function amount(v){return Math.max(0,Number(v)||0)}
  function round2(v){return Math.round(amount(v)*100)/100}
  function quoteBreakdown(q){
    q=q||{};
    var itemsTotal=amount(q.itemsTotal),discount=Math.min(itemsTotal,amount(q.discount)),net=round2(itemsTotal-discount),tax=amount(q.tax),shipping=amount(q.shipping),other=amount(q.other);
    var discountRate=q.discountRate===undefined||q.discountRate===null?(itemsTotal?round2(discount/itemsTotal*100):0):amount(q.discountRate);
    var taxRate=q.taxRate===undefined||q.taxRate===null?(net?round2(tax/net*100):0):amount(q.taxRate);
    return {itemsTotal:itemsTotal,discount:discount,discountRate:discountRate,net:net,tax:tax,taxRate:taxRate,shipping:shipping,other:other,total:round2(net+tax+shipping+other)};
  }
  function pricingHtml(q,extraClass){
    var b=quoteBreakdown(q),discLabel='خصم'+(b.discountRate?' ('+b.discountRate+'%)':''),taxLabel='ضريبة القيمة المضافة'+(b.taxRate?' ('+b.taxRate+'%)':'');
    return '<div class="financial-summary '+(extraClass||'')+'"><div><span>إجمالي البنود</span><b>'+money(b.itemsTotal)+'</b></div><div><span>'+discLabel+'</span><b>− '+money(b.discount)+'</b></div><div><span>صافي البنود</span><b>'+money(b.net)+'</b></div><div><span>'+taxLabel+'</span><b>+ '+money(b.tax)+'</b></div><div><span>مصاريف النقل</span><b>+ '+money(b.shipping)+'</b></div>'+(b.other?'<div><span>رسوم إضافية</span><b>+ '+money(b.other)+'</b></div>':'')+'<div class="finance-total"><span>الإجمالي النهائي للعرض</span><b>'+money(b.total)+'</b></div></div>';
  }
  function total(q){return quoteBreakdown(q).total}
  function qItem(q,itemId){return (q.items||[]).find(function(i){return i.itemId===itemId})}
  function valid(q,itemId){var i=qItem(q,itemId);return i&&Number(i.unitPrice)>0&&i.availability!=='غير متوفر'}
  function sumItems(items){return items.reduce(function(n,i){return n+Number(i.subtotal||0)},0)}
  function allocatedBreakdown(q,items){
    var part=sumItems(items),all=quoteBreakdown(q),ratio=all.itemsTotal?part/all.itemsTotal:1;
    return {itemsTotal:round2(part),discount:round2(all.discount*ratio),discountRate:all.discountRate,net:round2(part-all.discount*ratio),tax:round2(all.tax*ratio),taxRate:all.taxRate,shipping:round2(all.shipping*ratio),other:round2(all.other*ratio),total:round2(part-all.discount*ratio+all.tax*ratio+all.shipping*ratio+all.other*ratio)};
  }
  function allocated(q,items){return allocatedBreakdown(q,items).total}
  function avg(a){return a.length?a.reduce(function(s,n){return s+Number(n||0)},0)/a.length:0}
  function rating(email,role){var a=db.ratings.filter(function(r){return r.toEmail===email&&r.toRole===role});return a.length?Math.round(avg(a.map(function(r){return r.overall}))*10)/10:0}
  function outstanding(email){return db.pos.filter(function(p){return p.buyerEmail===email&&['بانتظار تأكيد المورد','قيد التجهيز','خرج للتوريد','بانتظار تأكيد استلام العميل'].indexOf(p.status)>-1}).reduce(function(s,p){return s+Number(p.total||0)},0)}
  function next(type){db.counters[type]=(db.counters[type]||0)+1;return String(db.counters[type]).padStart(5,'0')}
  function addLog(text){db.activity.unshift({id:uid('ACT'),text:text,actor:session?session.email:'system',createdAt:now()})}
  function tone(s){s=String(s||'');if(/موثق|معتمد|مكتمل|مستلم|فاز|تم الحل/.test(s))return 'success';if(/مرفوض|ملغي|مقيد/.test(s))return 'danger';if(/بانتظار|مفتوح|قيد|خرج|مراجعة|معلق/.test(s))return 'warn';if(/مُرسل|مرسل|جديد/.test(s))return 'info';return 'neutral'}
  function status(s){return '<span class="status '+tone(s)+'">'+esc(s||'—')+'</span>'}
  function cmd(fn,args,label,style){
    if(!Array.isArray(args))args=[args];
    var a=args.map(function(x){return '&quot;'+esc(x)+'&quot;'}).join(',');
    return '<button type="button" class="btn '+(style||'ghost')+' tiny" onclick="'+fn+'('+a+')">'+label+'</button>';
  }
  function panel(title,sub,tools,body){return '<section class="panel"><div class="panel-head"><div><h2>'+title+'</h2><p>'+sub+'</p></div><div class="actions">'+(tools||'')+'</div></div>'+body+'</section>'}
  function empty(title,sub){return '<div class="empty"><h3>'+title+'</h3><p class="small">'+sub+'</p></div>'}
  function cards(arr){return '<div class="cards">'+(arr.length?arr.join(''):empty('لا توجد بيانات بعد','ابدأ بالخطوة المناسبة من الزر أعلاه.'))+'</div>'}
  function openModal(html){$('modalBody').innerHTML=html;$('modal').showModal()}
  function closeModal(){if($('modal').open)$('modal').close()}
  function modalHead(title,sub){return '<div class="dialog-head"><div><h2>'+title+'</h2><p>'+sub+'</p></div><button type="button" class="close" onclick="closeModal()">×</button></div>'}
  function modalError(text){var root=$('modalBody'),box=root.querySelector('.form-error');if(!box){box=document.createElement('div');box.className='form-error';root.insertBefore(box,root.firstChild)}box.textContent=text;box.scrollIntoView({block:'nearest'})}
  function flash(text){var el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(function(){el.classList.remove('show')},2500)}
  function ensureSession(){if(session&&!profile(session.email,session.role)){session=null;localStorage.removeItem(SESSION_KEY)}}

  function cloudConfigured(){return !!(window.SilahCloud&&window.SilahCloud.enabled&&window.SilahCloud.enabled())}
  function usingCloud(){return !!(cloudConfigured()&&session&&session.cloud)}
  function cloudFile(row){return {id:row.id,remoteId:row.id,bucketId:row.bucket_id,storagePath:row.storage_path,name:row.file_name,size:Number(row.file_size||0),type:row.mime_type||'application/octet-stream',createdAt:row.created_at}}
  function cloudToDb(raw){
    raw=raw||{};var b=baseDB(),byId={},docsByOwner={},attachments={};
    (raw.profileDocuments||[]).forEach(function(d){if(!docsByOwner[d.owner_id])docsByOwner[d.owner_id]={};docsByOwner[d.owner_id][d.document_type]=d});
    (raw.attachments||[]).forEach(function(a){var key=a.entity_type+':'+a.entity_id;if(!attachments[key])attachments[key]=[];attachments[key].push(cloudFile(a))});
    b.profiles=(raw.profiles||[]).map(function(p){
      var docs=docsByOwner[p.id]||{},c=docs.commercial,t=docs.tax,s=docs.signer,documentData={};
      if(c){documentData.commercialNumber=c.reference_number||'';documentData.commercialFile=cloudFile(c)}
      if(t){documentData.taxNumber=t.reference_number||'';documentData.taxFile=cloudFile(t)}
      if(s){documentData.signerName=s.signer_name||'';documentData.signerTitle=s.signer_title||'';documentData.signerFile=cloudFile(s)}
      var out={id:p.id,email:p.email,role:p.role,name:p.company||p.email,company:p.company||'',contact:p.contact_name||'',phone:p.phone||'',city:p.city||'',categories:Array.isArray(p.categories)?p.categories:[],brands:p.brands||'',paymentTerms:p.payment_terms||'نقدي',leadTime:Number(p.lead_time_days||0),creditLimit:Number(p.credit_limit||0),creditRestricted:!!p.credit_restricted,verification:p.verification_status||'غير مكتمل',rating:Number(p.rating||0),financial:Number(p.financial_score||0),operational:Number(p.operational_score||0),docs:{commercial:!!c,tax:!!t,signer:!!s},documentData:documentData,createdAt:p.created_at,updatedAt:p.updated_at};byId[p.id]=out;return out;
    });
    function remoteProfile(id){return byId[id]||{id:id,email:'',role:'',company:'',name:''}}
    b.rfqs=(raw.rfqs||[]).map(function(r){var buyer=remoteProfile(r.buyer_id);return {id:r.id,buyerId:r.buyer_id,number:r.number,buyerEmail:buyer.email,company:r.company,project:r.project,category:r.category,location:r.location,deadline:r.deadline,payment:r.payment,notes:r.notes||'',attachments:attachments['rfq:'+r.id]||[],status:r.status,createdAt:r.created_at,updatedAt:r.updated_at,items:(r.rfq_items||[]).map(function(i){return {id:i.id,name:i.name,qty:Number(i.quantity||0),unit:i.unit,spec:i.specification||''}})}});
    b.quotes=(raw.quotes||[]).map(function(q){var supplier=remoteProfile(q.supplier_id);return {id:q.id,rfqId:q.rfq_id,supplierId:q.supplier_id,number:q.number,supplierEmail:supplier.email,supplier:q.supplier_name||supplier.company||supplier.name,items:(q.quote_items||[]).map(function(i){return {id:i.id,quoteItemId:i.id,itemId:i.rfq_item_id,name:i.name,qty:Number(i.quantity||0),unit:i.unit,unitPrice:Number(i.unit_price||0),subtotal:Number(i.subtotal||0),availability:i.availability||'متوفر',brand:i.brand||'',origin:i.origin||'',warranty:i.warranty||''}}),itemsTotal:Number(q.items_total||0),manualTotal:0,discount:Number(q.discount||0),discountRate:Number(q.discount_rate||0),tax:Number(q.tax||0),taxRate:Number(q.tax_rate||0),shipping:Number(q.shipping||0),other:Number(q.other||0),deliveryDays:Number(q.delivery_days||0),validity:Number(q.validity_days||0),payment:q.payment||'نقدي',notes:q.notes||'',attachments:attachments['quote:'+q.id]||[],status:q.status||'مُرسل',createdAt:q.created_at,updatedAt:q.updated_at}});
    b.pos=(raw.purchaseOrders||[]).map(function(o){var buyer=remoteProfile(o.buyer_id),supplier=remoteProfile(o.supplier_id),rfq=b.rfqs.find(function(r){return r.id===o.rfq_id}),history=(o.po_status_events||[]).slice().sort(function(a,c){return String(a.created_at).localeCompare(String(c.created_at))}).map(function(e){var actor=remoteProfile(e.actor_id);return {status:e.status,actor:actor.email||'النظام',role:actor.role||'system',createdAt:e.created_at}});return {id:o.id,rfqId:o.rfq_id,quoteId:o.quote_id,buyerId:o.buyer_id,supplierId:o.supplier_id,number:o.number,rfqNumber:rfq?rfq.number:'—',buyerEmail:buyer.email,supplierEmail:supplier.email,buyer:buyer.company||buyer.name,supplier:supplier.company||supplier.name,project:o.project||'',items:(o.po_items||[]).map(function(i){return {id:i.id,quoteItemId:i.quote_item_id,itemId:i.quote_item_id,name:i.name,qty:Number(i.quantity||0),unit:i.unit,unitPrice:Number(i.unit_price||0),subtotal:Number(i.subtotal||0)}}),pricing:o.pricing&&typeof o.pricing==='object'?o.pricing:{},total:Number(o.total||0),payment:o.payment||'نقدي',deliveryDays:Number(o.delivery_days||0),status:o.status,createdAt:o.created_at,updatedAt:o.updated_at,receivedAt:o.received_at,notes:o.notes||'',history:history}});
    b.pos.forEach(function(o){if(!o.quoteId)return;var q=b.quotes.find(function(x){return x.id===o.quoteId});if(!q)return;var chosen=o.items.filter(function(i){return !!i.quoteItemId}).length;q.status=q.items.length&&chosen<q.items.length?'فاز جزئيًا':'فاز كليًا'});
    b.ratings=(raw.ratings||[]).map(function(r){var from=remoteProfile(r.from_id),to=remoteProfile(r.to_id);return {id:r.id,poId:r.purchase_order_id,fromEmail:from.email,fromRole:from.role,toEmail:to.email,toRole:to.role,delivery:Number(r.delivery||0),quality:Number(r.quality||0),communication:Number(r.communication||0),overall:Number(r.overall||0),comment:r.comment||'',createdAt:r.created_at}});
    b.credits=(raw.credits||[]).map(function(c){var buyer=remoteProfile(c.buyer_id);return {id:c.id,buyerId:c.buyer_id,buyerEmail:buyer.email,amount:Number(c.amount||0),days:Number(c.days||0),reason:c.reason||'',status:c.status,reviewedAt:c.reviewed_at,createdAt:c.created_at}});
    b.disputes=(raw.disputes||[]).map(function(d){var opener=remoteProfile(d.opened_by);return {id:d.id,number:d.number,poId:d.purchase_order_id,openedById:d.opened_by,openedByEmail:opener.email,openedByRole:opener.role,reason:d.reason,details:d.details,status:d.status,resolvedAt:d.resolved_at,createdAt:d.created_at}});
    b.activity=[];b.counters={rfq:b.rfqs.length,quote:b.quotes.length,po:b.pos.length};return normalize(b);
  }
  async function syncCloud(){
    if(!usingCloud())return db;
    var raw=await window.SilahCloud.loadDashboard();db=cloudToDb(raw);cacheDB();render();return db;
  }
  function subscribeCloud(){
    if(!usingCloud())return;
    window.SilahCloud.subscribe(function(){clearTimeout(cloudRefreshTimer);cloudRefreshTimer=setTimeout(function(){if(usingCloud())syncCloud().catch(function(){})},450)});
  }
  function cloudMessage(err){
    var raw=String(err&&err.message||'').toLowerCase();
    var code=String(err&&err.code||'').toLowerCase();
    if(raw.indexOf('invalid login credentials')>-1)return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
    if(raw.indexOf('user already registered')>-1)return 'هذا البريد مسجل بالفعل. استخدم «تسجيل الدخول».';
    if(raw.indexOf('email rate limit')>-1)return 'تم إرسال طلبات كثيرة للبريد. أعد المحاولة لاحقًا.';
    if(raw.indexOf('email not confirmed')>-1)return 'البريد غير مؤكد. تأكد من تعطيل «Confirm email» في إعدادات Supabase.';
    if(raw.indexOf('password')>-1&&raw.indexOf('least')>-1)return 'كلمة المرور لا تستوفي متطلبات الأمان.';
    if(raw.indexOf('row-level security')>-1||code==='42501')return 'تم رفض العملية بسبب صلاحيات الحساب في قاعدة البيانات. راجع إعداد الحساب أو سياسة RLS المطلوبة.';
    if(raw.indexOf('permission denied')>-1)return 'صلاحيات هذا الحساب لا تسمح بإتمام العملية المطلوبة.';
    if(raw.indexOf('failed to fetch')>-1||raw.indexOf('network request failed')>-1)return 'تعذر الوصول إلى خدمة الحسابات الآن. تحقق من إعدادات Supabase أو حاول بعد لحظات.';
    if(raw.indexOf('role-mismatch')>-1)return 'هذه البوابة لا تطابق نوع الحساب المسجل بهذا البريد.';
    if(raw.indexOf('profile-pending')>-1)return 'تم إنشاء الحساب، ويجري تجهيز ملفه الآن. أعد المحاولة بعد لحظات.';
    if(raw.indexOf('auth-session-missing')>-1)return 'تمت المصادقة لكن تعذر بدء جلسة الدخول. سجّل الخروج ثم أعد المحاولة.';
    if(raw.indexOf('signup-session-missing')>-1)return 'تم إنشاء الحساب، لكن الدخول الفوري غير متاح. تأكد من إيقاف «Confirm email» ثم جرّب تسجيل الدخول.';
    if(raw.indexOf('not configured')>-1||raw.indexOf('لم يتم إعداد')>-1)return 'خدمة الحسابات غير مهيأة الآن. راجع إعداد Supabase.';
    return 'تعذر إتمام العملية الآن. تحقق من الاتصال ثم أعد المحاولة.';
  }
  async function restoreCloudSession(){
    if(!cloudConfigured()||(session&&!session.cloud))return;
    try{var user=await window.SilahCloud.currentUser();if(!user)return;var p=await window.SilahCloud.getMyProfile();if(!p)return;session={email:user.email,role:p.role,userId:user.id,cloud:true};localStorage.setItem(SESSION_KEY,JSON.stringify(session));await syncCloud();subscribeCloud()}catch(e){}
  }

  function fileStore(){
    return new Promise(function(resolve,reject){
      if(!window.indexedDB){reject(new Error('no-indexeddb'));return}
      var req=indexedDB.open(FILE_DB,1);
      req.onupgradeneeded=function(){var store=req.result.objectStoreNames.contains('files')?req.transaction.objectStore('files'):req.result.createObjectStore('files',{keyPath:'id'});if(!store.indexNames.contains('createdAt'))store.createIndex('createdAt','createdAt')};
      req.onsuccess=function(){resolve(req.result)};
      req.onerror=function(){reject(req.error||new Error('file-db-error'))};
    });
  }
  function putFile(meta,file){
    return fileStore().then(function(dbf){return new Promise(function(resolve,reject){var tx=dbf.transaction('files','readwrite');tx.objectStore('files').put({id:meta.storeId,name:meta.name,type:meta.type,size:meta.size,blob:file,createdAt:meta.createdAt});tx.oncomplete=function(){dbf.close();resolve(meta)};tx.onerror=function(){dbf.close();reject(tx.error||new Error('file-save-error'))}})});
  }
  function getFile(storeId){
    return fileStore().then(function(dbf){return new Promise(function(resolve,reject){var tx=dbf.transaction('files','readonly'),req=tx.objectStore('files').get(storeId);req.onsuccess=function(){dbf.close();resolve(req.result||null)};req.onerror=function(){dbf.close();reject(req.error||new Error('file-read-error'))}})});
  }
  function sizeText(bytes){var n=Number(bytes||0);return n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB'}
  function persistFiles(fileList,bucketId){
    var files=Array.prototype.slice.call(fileList||[]),totalSize=files.reduce(function(s,f){return s+Number(f.size||0)},0);
    if(files.length>8)return Promise.reject(new Error('يمكن رفع 8 ملفات كحد أقصى في المرة الواحدة.'));
    if(files.some(function(f){return Number(f.size||0)>8*1024*1024}))return Promise.reject(new Error('حجم الملف الواحد يجب ألا يزيد عن 8 MB.'));
    if(totalSize>18*1024*1024)return Promise.reject(new Error('إجمالي المرفقات يجب ألا يزيد عن 18 MB.'));
    if(usingCloud()){
      if(!bucketId)return Promise.reject(new Error('تعذر تحديد مكان حفظ المرفق.'));
      return Promise.all(files.map(function(file){var id=uid('FILE');return window.SilahCloud.uploadPrivateFile(bucketId,file,id)}));
    }
    return Promise.all(files.map(function(file){var meta={id:uid('FILE'),storeId:uid('BLOB'),name:file.name,size:file.size,type:file.type||'application/octet-stream',createdAt:now()};return putFile(meta,file)}));
  }
  function attachmentList(files,emptyText){
    files=Array.isArray(files)?files:[];
    if(!files.length)return '<span class="muted small">'+esc(emptyText||'لا توجد مرفقات.')+'</span>';
    return '<div class="attachment-list">'+files.map(function(f){var canOpen=!!(f.id||f.storeId||f.dataUrl||(f.bucketId&&f.storagePath));return '<div class="attachment"><div><b>📎 '+esc(f.name||'مرفق')+'</b><small>'+sizeText(f.size)+' · '+esc((f.type||'ملف').replace('application/',''))+'</small></div><div class="actions">'+(canOpen?cmd('openAttachment',f.id,'فتح','soft')+cmd('downloadAttachment',f.id,'تنزيل','ghost'):'<span class="muted small">غير متاح</span>')+'</div></div>'}).join('')+'</div>';
  }
  function findAttachment(id){
    var found=null;
    db.rfqs.some(function(r){return (r.attachments||[]).some(function(f){if(f.id===id){found=f;return true}return false})});
    if(found)return found;
    db.quotes.some(function(q){return (q.attachments||[]).some(function(f){if(f.id===id){found=f;return true}return false})});
    if(found)return found;
    db.profiles.some(function(p){var d=p.documentData||{};return ['commercialFile','taxFile','signerFile'].some(function(k){if(d[k]&&d[k].id===id){found=d[k];return true}return false})});
    return found;
  }
  function attachmentBlob(f){
    if(f&&f.dataUrl)return fetch(f.dataUrl).then(function(res){return res.blob()});
    if(f&&f.bucketId&&f.storagePath&&usingCloud())return window.SilahCloud.signedUrl(f.bucketId,f.storagePath,120).then(function(url){return fetch(url).then(function(res){if(!res.ok)throw new Error('file-fetch-failed');return res.blob()})});
    if(!f||!f.storeId)return Promise.reject(new Error('missing-file'));
    return getFile(f.storeId).then(function(saved){if(!saved||!saved.blob)throw new Error('missing-file');return saved.blob});
  }
  function fileUrl(blob){return URL.createObjectURL(blob)}
  function downloadBlob(f,blob){var url=fileUrl(blob),a=document.createElement('a');a.href=url;a.download=f.name||'silah-file';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},1500)}
  window.downloadAttachment=function(id){var f=findAttachment(id);if(!f){flash('تعذر العثور على المرفق.');return}attachmentBlob(f).then(function(blob){downloadBlob(f,blob)}).catch(function(){flash('الملف غير متاح على هذا المتصفح. ارفعه مرة أخرى.')})}
  window.openAttachment=function(id){
    var f=findAttachment(id);if(!f){flash('تعذر العثور على المرفق.');return}
    attachmentBlob(f).then(function(blob){
      var url=fileUrl(blob),type=f.type||blob.type||'',name=f.name||'مرفق',preview='';
      if(/^image\//.test(type)||/\.(png|jpe?g|webp|gif)$/i.test(name))preview='<img class="attachment-preview" src="'+url+'" alt="'+esc(name)+'">';
      else if(type==='application/pdf'||/\.pdf$/i.test(name))preview='<iframe class="attachment-frame" src="'+url+'" title="'+esc(name)+'"></iframe>';
      else preview='<div class="file-preview"><div class="avatar">📄</div><div><b>'+esc(name)+'</b><p class="muted small">يمكن تنزيل هذا الملف وفتحه من تطبيق Excel أو Word على هاتفك.</p></div></div>';
      openModal(modalHead(esc(name),'معاينة المرفق وتنزيله.')+preview+'<div class="actions" style="margin-top:14px"><button type="button" class="btn primary" onclick="downloadAttachment(&quot;'+esc(id)+'&quot;)">تنزيل الملف</button><button type="button" class="btn ghost" onclick="closeModal()">إغلاق</button></div>');
      setTimeout(function(){URL.revokeObjectURL(url)},300000);
    }).catch(function(){flash('الملف غير متاح على هذا المتصفح. ارفعه مرة أخرى.')});
  }

  function tabs(role){if(role==='buyer')return [['dashboard','لوحة العميل'],['rfqs','طلبات الشراء'],['quotes','العروض والمقارنة'],['orders','أوامر الشراء'],['credit','الائتمان والثقة'],['profile','ملف الشركة'],['ratings','التقييمات']];if(role==='supplier')return [['dashboard','فرص التوريد'],['rfqs','طلبات متاحة'],['quotes','عروضي'],['orders','أوامر التوريد'],['profile','ملف المورد'],['ratings','التقييمات']];return [['dashboard','مركز القيادة'],['profiles','التحقق والحسابات'],['rfqs','طلبات الشراء'],['quotes','العروض'],['orders','الأوامر والتوريد'],['credit','الائتمان والمخاطر'],['disputes','النزاعات'],['ratings','جودة الشبكة'],['activity','سجل العمليات'],['settings','سياسة الإطلاق']]}
  function render(){
    ensureSession();
    $('publicTools').classList.toggle('hidden',!!session);
    $('sessionTools').classList.toggle('hidden',!session);
    $('landingView').classList.toggle('hidden',!!session);
    $('authView').classList.add('hidden');
    $('appView').classList.toggle('hidden',!session);
    if(session)renderApp();
  }
  function stat(label,value,sub,tab){return '<button type="button" class="stat" onclick="setTab(&quot;'+tab+'&quot;)"><span>'+label+'</span><strong>'+value+'</strong><small>'+sub+'</small></button>'}
  function renderApp(){
    var p=me();if(!p){logout();return}
    $('sessionBadge').textContent=(session.role==='buyer'?'▣ ':session.role==='supplier'?'↗ ':'◈ ')+roleName(session.role)+(usingCloud()?' · متصل بالسحابة':'');
    $('appTitle').textContent=session.role==='buyer'?'مرحبًا، '+(p.company||p.name||'قسم المشتريات'):session.role==='supplier'?'مرحبًا، '+(p.company||p.name||'مورد صِلَة'):'مرحبًا، إدارة صِلَة';
    $('appSubtitle').textContent=session.role==='buyer'?'من طلب الشراء إلى استلام التوريد في مكان واحد.':session.role==='supplier'?'قدّم عرضك بوضوح وتابع كل أمر توريد بثقة.':'راقب الشبكة التشغيلية واعتمد الحسابات والائتمان.';
    var ta=$('topAction');
    if(session.role==='buyer'){ta.textContent='طلب شراء جديد';ta.className='btn primary';ta.onclick=openRequest}
    else if(session.role==='supplier'){ta.textContent=complete(p)?'بيانات المورد':'أكمل ملف المورد';ta.className=complete(p)?'btn ghost':'btn primary';ta.onclick=openProfile}
    else{ta.textContent='مراجعة الحسابات';ta.className='btn navy';ta.onclick=function(){setTab('profiles')}}
    var on=$('onboarding');
    if(!complete(p)&&session.role!=='admin'){on.classList.remove('hidden');on.innerHTML='<div><b>خطوة مهمة قبل بدء التعامل</b>أكمل بيانات الشركة الأساسية ثم أضف مستندات التحقق لتظهر بصورة موثوقة للطرف الآخر.</div><button type="button" class="btn primary tiny" onclick="openProfile()">إكمال الملف</button>'}
    else if(session.role!=='admin'&&p.verification==='بيانات مكتملة — توثيق ناقص'){on.classList.remove('hidden');on.innerHTML='<div><b>بيانات الشركة مكتملة</b>أضف السجل التجاري والبطاقة الضريبية وبيانات المفوض لإرسال الملف للاعتماد.</div><button type="button" class="btn soft tiny" onclick="openProfile()">استكمال التوثيق</button>'}
    else if(session.role!=='admin'&&p.verification==='قيد المراجعة'){on.classList.remove('hidden');on.innerHTML='<div><b>ملفك مكتمل وقيد مراجعة الإدارة</b>لا تحتاج إلى إعادة إدخال البيانات. ستظهر لك شارة «موثق» بعد الاعتماد.</div><button type="button" class="btn soft tiny" onclick="openProfile()">عرض الملف</button>'}
    else if(session.role!=='admin'&&p.verification==='مرفوض'){on.classList.remove('hidden');on.innerHTML='<div><b>يحتاج الملف إلى تعديل</b>راجع بيانات الشركة أو مستندات التحقق ثم أرسله مرة أخرى للمراجعة.</div><button type="button" class="btn warn tiny" onclick="openProfile()">مراجعة الملف</button>'}
    else if(session.role==='supplier'&&p.founder){on.classList.remove('hidden');on.innerHTML='<div><b>أنت مورد مؤسس في صِلَة</b>التسجيل وتجهيز الحساب مجانًا، وأول 3 مبيعات ناجحة بلا رسوم. تظهر أي رسوم لاحقة بوضوح قبل تقديم العرض.</div><span class="badge orange">عرض إطلاق</span>'}
    else on.classList.add('hidden');
    renderStats();
    var ts=tabs(session.role);if(!ts.some(function(x){return x[0]===active}))active='dashboard';
    $('tabs').innerHTML=ts.map(function(x){return '<button type="button" class="tab '+(active===x[0]?'active':'')+'" onclick="setTab(&quot;'+x[0]+'&quot;)">'+x[1]+'</button>'}).join('');
    $('content').innerHTML=view();
  }
  function renderStats(){
    var rr=session.role==='buyer'?db.rfqs.filter(function(r){return r.buyerEmail===session.email}):db.rfqs;
    var qq=session.role==='buyer'?db.quotes.filter(function(q){var r=db.rfqs.find(function(x){return x.id===q.rfqId});return r&&r.buyerEmail===session.email}):session.role==='supplier'?db.quotes.filter(function(q){return q.supplierEmail===session.email}):db.quotes;
    var pp=session.role==='buyer'?db.pos.filter(function(p){return p.buyerEmail===session.email}):session.role==='supplier'?db.pos.filter(function(p){return p.supplierEmail===session.email}):db.pos;
    var h='';
    if(session.role==='buyer'){var p=me(),used=outstanding(session.email),free=Math.max(0,Number(p.creditLimit||0)-used);h=stat('طلبات الشراء',rr.length,'المفتوح: '+rr.filter(function(r){return r.status==='مفتوح لاستقبال العروض'}).length,'rfqs')+stat('العروض المستلمة',qq.length,'جاهزة للمقارنة','quotes')+stat('أوامر الشراء',pp.length,'قيد المتابعة: '+pp.filter(function(p){return p.status!=='مكتمل'}).length,'orders')+stat('ائتمان متاح',smallMoney(free),'الحد: '+smallMoney(p.creditLimit||0),'credit')}
    else if(session.role==='supplier'){h=stat('طلبات متاحة',rr.filter(function(r){return r.status==='مفتوح لاستقبال العروض'}).length,'في فئات التوريد','rfqs')+stat('عروضي',qq.length,'العروض المرسلة','quotes')+stat('أوامر توريد',pp.length,'تحتاج متابعة: '+pp.filter(function(p){return p.status!=='مكتمل'}).length,'orders')+stat('تقييم المورد',rating(session.email,'supplier')||'جديد','تشغيل: '+(me().operational||'—'),'ratings')}
    else{var pending=db.profiles.filter(function(p){return p.role!=='admin'&&p.verification==='قيد المراجعة'}).length;h=stat('حسابات قيد المراجعة',pending,'تحقق وتوثيق','profiles')+stat('طلبات مفتوحة',rr.filter(function(r){return r.status==='مفتوح لاستقبال العروض'}).length,'طلبات عروض سعر','rfqs')+stat('أوامر نشطة',pp.filter(function(p){return p.status!=='مكتمل'}).length,'متابعة التوريد','orders')+stat('قيمة أوامر ممررة',smallMoney(pp.reduce(function(s,p){return s+Number(p.total||0)},0)),'ليست إيراد صِلَة','credit')}
    $('stats').innerHTML=h;
  }
  function view(){return session.role==='buyer'?buyerView():session.role==='supplier'?supplierView():adminView()}

  function rfqCard(r){
    var q=db.quotes.filter(function(x){return x.rfqId===r.id}),a=cmd('requestDetails',r.id,'التفاصيل');
    if(session.role==='supplier'&&r.status==='مفتوح لاستقبال العروض')a+=cmd('openQuote',r.id,q.some(function(x){return x.supplierEmail===session.email})?'تحديث العرض':'تقديم عرض','primary');
    if((session.role==='admin'||session.role==='buyer'&&r.buyerEmail===session.email)&&q.length)a+=cmd('compare',r.id,'مقارنة وتقسيم','navy');
    if(session.role==='buyer'&&r.buyerEmail===session.email&&r.status==='مفتوح لاستقبال العروض')a+=cmd('closeRequest',r.id,'إغلاق','warn');
    return '<article class="card"><div class="card-row"><div><div class="title">'+esc(r.number)+'</div><div class="small">'+esc(r.project)+'</div></div>'+status(r.status)+'</div><div class="meta"><span>'+esc(r.type||'طلب شراء')+'</span><span>'+esc(r.category)+'</span><span>'+esc(r.location)+'</span><span>العروض: '+q.length+'</span><span>البنود: '+(r.items||[]).length+'</span><span>آخر موعد: '+date(r.deadline)+'</span></div><p class="muted small">'+esc(r.notes||'لا توجد ملاحظات إضافية.')+'</p><div class="actions">'+a+'</div></article>';
  }
  function quoteCard(q){
    var r=db.rfqs.find(function(x){return x.id===q.rfqId}),a=cmd('quoteDetails',q.id,'تفاصيل العرض');
    if(session.role==='supplier'&&q.supplierEmail===session.email&&r&&r.status==='مفتوح لاستقبال العروض')a+=cmd('openQuote',r.id,'تحديث العرض','primary');
    if((session.role==='admin'||session.role==='buyer'&&r&&r.buyerEmail===session.email)&&r)a+=cmd('compare',r.id,'مقارنة الطلب','navy');
    var finance=quoteBreakdown(q),quoteTotal=Number(total(q)||0),hasFiles=(q.attachments||[]).length;
    return '<article class="card"><div class="card-row"><div><div class="title">'+esc(q.supplier)+'</div><div class="small muted">'+esc(r?r.number+' — '+r.project:'طلب غير متاح')+'</div></div><div>'+status(q.status||'مُرسل')+' <span class="badge orange">★ '+(rating(q.supplierEmail,'supplier')||pFor(q.supplierEmail,'supplier').rating||'جديد')+'</span></div></div><div class="meta"><span>الإجمالي النهائي: <b>'+ (quoteTotal?money(quoteTotal):(hasFiles?'عرض مرفق':'—')) +'</b></span>'+ (quoteTotal?'<span>البنود: '+money(finance.itemsTotal)+'</span><span>خصم: '+money(finance.discount)+(finance.discountRate?' ('+finance.discountRate+'%)':'')+'</span><span>ضريبة: '+money(finance.tax)+(finance.taxRate?' ('+finance.taxRate+'%)':'')+'</span><span>نقل: '+money(finance.shipping)+'</span>':'') +'<span>تسليم: '+esc(q.deliveryDays)+' يوم</span><span>الدفع: '+esc(q.payment||'غير محدد')+'</span><span>صلاحية: '+esc(q.validity)+' أيام</span></div><p class="muted small">'+esc(q.notes||(hasFiles?'التفاصيل الكاملة داخل المرفق.':'عرض تفصيلي لكل بند.'))+'</p><div class="actions">'+a+'</div></article>';
  }
  function poCard(p){
    var sup=session.role==='supplier'&&p.supplierEmail===session.email,buy=session.role==='buyer'&&p.buyerEmail===session.email,a=cmd('poDetails',p.id,'تفاصيل الأمر');
    if(sup&&p.status==='بانتظار تأكيد المورد')a+=cmd('advancePo',[p.id,'قيد التجهيز'],'قبول الطلب','primary');
    if(sup&&p.status==='قيد التجهيز')a+=cmd('advancePo',[p.id,'خرج للتوريد'],'خرج للتوريد','primary');
    if(sup&&p.status==='خرج للتوريد')a+=cmd('advancePo',[p.id,'بانتظار تأكيد استلام العميل'],'تم التسليم للموقع','primary');
    if(buy&&p.status==='بانتظار تأكيد استلام العميل')a+=cmd('receivePo',p.id,'تأكيد الاستلام','primary');
    if((sup||buy)&&p.status!=='مكتمل')a+=cmd('openDispute',p.id,'فتح نزاع','warn');
    if((sup||buy)&&p.status==='مكتمل')a+=cmd('openRating',p.id,'إضافة تقييم','soft');
    return '<article class="card"><div class="card-row"><div><div class="title">'+esc(p.number)+'</div><div class="small muted">'+esc(p.project)+'</div></div>'+status(p.status)+'</div><div class="meta"><span>المورد: '+esc(p.supplier)+'</span><span>العميل: '+esc(p.buyer||nameOf(p.buyerEmail,'buyer'))+'</span><span>الإجمالي: <b>'+money(p.total)+'</b></span><span>الدفع: '+esc(p.payment||'—')+'</span><span>البنود: '+(p.items||[]).length+'</span></div><div class="actions">'+a+'</div></article>';
  }
  function buyerView(){
    var rr=db.rfqs.filter(function(r){return r.buyerEmail===session.email}),qq=db.quotes.filter(function(q){var r=db.rfqs.find(function(x){return x.id===q.rfqId});return r&&r.buyerEmail===session.email}),pp=db.pos.filter(function(p){return p.buyerEmail===session.email});
    if(active==='dashboard')return panel('ملخص المشتريات','ابدأ طلبًا جديدًا أو تابع ما وصل من الموردين.','<button type="button" class="btn primary" onclick="openRequest()">طلب شراء جديد</button>','<div class="dashboard-grid"><div>'+cards(rr.slice(0,3).map(rfqCard))+'</div><div class="warning"><h3>كيف تعمل صِلَة؟</h3><p>تنشر طلبك، الموردون يقدمون عروضًا تفصيلية، ثم تختار موردًا واحدًا أو تقسم البنود بين أكثر من مورد. دفع البضاعة وفاتورتها بينك وبين المورد مباشرة.</p><div class="actions" style="margin-top:12px"><button type="button" class="btn navy tiny" onclick="setTab(&quot;quotes&quot;)">عرض العروض</button><button type="button" class="btn ghost tiny" onclick="setTab(&quot;credit&quot;)">الائتمان والثقة</button></div></div></div>');
    if(active==='rfqs')return panel('طلبات الشراء','أضف البنود والمواصفات والمرفقات ثم انشرها للموردين.','<button type="button" class="btn primary" onclick="openRequest()">طلب شراء جديد</button>',cards(rr.map(rfqCard)));
    if(active==='quotes'){var groups=rr.map(function(r){var a=qq.filter(function(q){return q.rfqId===r.id});if(!a.length)return '<article class="card"><div class="card-row"><div><div class="title">'+esc(r.number)+' — '+esc(r.project)+'</div><p class="muted small">لم يصل أي عرض بعد.</p></div>'+status(r.status)+'</div>'+cmd('requestDetails',r.id,'تفاصيل')+'</article>';var priced=a.filter(function(q){return Number(total(q)||0)>0}),summary=priced.length?'أقل إجمالي '+money(Math.min.apply(null,priced.map(total))):(a.some(function(q){return (q.attachments||[]).length})?'عروض مرفقة تحتاج مراجعة':'عروض بدون إجمالي');return '<article class="card"><div class="card-row"><div><div class="title">'+esc(r.number)+' — '+esc(r.project)+'</div><p class="muted small">'+a.length+' عروض مستلمة · '+summary+'</p></div>'+status(r.status)+'</div><div class="meta"><span>البنود: '+r.items.length+'</span><span>الدفع: '+esc(r.payment)+'</span><span>المكان: '+esc(r.location)+'</span></div><div class="actions">'+cmd('compare',r.id,r.items.length?'افتح المقارنة الذكية':'راجع العروض المرفقة','navy')+cmd('requestDetails',r.id,'تفاصيل')+'</div></article>'});return panel('العروض والمقارنة','قارن عروض الموردين بندًا ببند، أو راجع عروض Excel والصور للطلبات المعتمدة على المرفقات.','',cards(groups))}
    if(active==='orders')return panel('أوامر الشراء','تابع تأكيد المورد والتجهيز والتوريد ثم أكد الاستلام.','',cards(pp.map(poCard)));
    if(active==='credit')return buyerCredit();
    if(active==='profile')return profileView();
    if(active==='ratings')return ratingsView();
    return activityView('سجل نشاط العميل');
  }
  function supplierView(){
    var open=db.rfqs.filter(function(r){return r.status==='مفتوح لاستقبال العروض'}),qq=db.quotes.filter(function(q){return q.supplierEmail===session.email}),pp=db.pos.filter(function(p){return p.supplierEmail===session.email}),self=me(),profileButton=complete(self)?'بيانات المورد':'إكمال ملف المورد';
    if(active==='dashboard')return panel('فرص التوريد','طلبات مفتوحة في شبكة صِلَة، مع متابعة عروضك وأوامرك.','', '<div class="dashboard-grid"><div>'+cards(open.slice(0,3).map(rfqCard))+'</div><div class="warning"><h3>برنامج المورد المؤسس</h3><p>التسجيل وتجهيز الحساب مجانًا. أول 3 مبيعات ناجحة بلا رسوم، وبعدها تظهر رسوم النجاح بوضوح قبل تقديم العرض. العميل يسدد لك مباشرة.</p><div class="actions" style="margin-top:12px"><button type="button" class="btn primary tiny" onclick="openProfile()">'+profileButton+'</button><button type="button" class="btn ghost tiny" onclick="setTab(&quot;rfqs&quot;)">استعراض الطلبات</button></div></div></div>');
    if(active==='rfqs')return panel('طلبات متاحة للتسعير','اطلع على البنود والمواصفات ثم قدم عرضًا تفصيليًا.','',cards(open.map(rfqCard)));
    if(active==='quotes')return panel('عروضي','يمكنك مراجعة العرض أو تحديثه طالما الطلب ما زال مفتوحًا.','',cards(qq.map(quoteCard)));
    if(active==='orders')return panel('أوامر التوريد','أكد الأمر ثم حدث حالة التجهيز والتوريد حتى يستلم العميل.','',cards(pp.map(poCard)));
    if(active==='profile')return profileView();
    if(active==='ratings')return ratingsView();
    return activityView('سجل نشاط المورد');
  }
  function adminView(){
    if(active==='dashboard'){var pending=db.profiles.filter(function(p){return p.role!=='admin'&&p.verification==='قيد المراجعة'}).length,dis=db.disputes.filter(function(x){return x.status==='مفتوح'}).length,risk=db.profiles.filter(function(p){return p.role==='buyer'&&p.creditRestricted}).length;return panel('مركز القيادة','ملخص التشغيل، التحقق، والمخاطر.','<button type="button" class="btn navy" onclick="setTab(&quot;profiles&quot;)">مراجعة الحسابات</button>','<div class="dashboard-grid"><div class="cards"><div class="card"><div class="title">حسابات تحتاج تحقق</div><b class="money" style="font-size:28px">'+pending+'</b><p class="muted small">موردون أو عملاء قدموا بياناتهم للمراجعة.</p></div><div class="card"><div class="title">نزاعات مفتوحة</div><b class="money" style="font-size:28px">'+dis+'</b><p class="muted small">تظل مسجلة بسجل مراجعة حتى الحل.</p></div><div class="card"><div class="title">حسابات مقيدة ائتمانيًا</div><b class="money" style="font-size:28px">'+risk+'</b><p class="muted small">لا يصدر لها شراء آجل حتى ترفع الإدارة القيد.</p></div></div><div class="feature-list"><div class="feature"><i>1</i><span><b>تحقق أولًا</b><br><small class="muted">السجل التجاري والبطاقة الضريبية والمفوض بالتوقيع.</small></span></div><div class="feature"><i>2</i><span><b>راقب دورة الطلب</b><br><small class="muted">من RFQ والعرض حتى أمر الشراء والتوريد.</small></span></div><div class="feature"><i>3</i><span><b>افصل الثقة المالية عن التشغيلية</b><br><small class="muted">التقييم لا يتداخل مع قرار الائتمان.</small></span></div></div></div>')}
    if(active==='profiles')return adminProfiles();
    if(active==='rfqs')return panel('كل طلبات الشراء','تدخل الإدارة للمتابعة والتأكد من اكتمال البيانات دون تسعير نيابة عن المورد.','',cards(db.rfqs.map(rfqCard)));
    if(active==='quotes')return panel('كل عروض الأسعار','مراجعة شفافة للأسعار والشروط وحالة اختيار كل عرض.','',cards(db.quotes.map(quoteCard)));
    if(active==='orders')return panel('الأوامر والتوريد','تابع الأمر من التأكيد حتى استلام العميل.','',cards(db.pos.map(poCard)));
    if(active==='credit')return adminCredit();
    if(active==='disputes')return disputesView();
    if(active==='ratings')return networkRatings();
    if(active==='activity')return activityView('سجل عمليات المنصة');
    return settingsView();
  }

  window.showLanding=function(){
    if(session){active='dashboard';renderApp();window.scrollTo({top:0,behavior:'smooth'});return}
    $('authView').classList.add('hidden');$('appView').classList.add('hidden');$('landingView').classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'});
  }
  window.openAuth=function(role,mode){
    $('landingView').classList.add('hidden');$('appView').classList.add('hidden');$('authView').classList.remove('hidden');
    setAuthMode(mode||(role==='admin'?'login':'signup'));
    $('role').value=(authMode==='signup'&&role==='admin')?'supplier':(role||'supplier');
    roleNote();$('password').value='';$('confirmPassword').value='';window.scrollTo({top:0,behavior:'smooth'});
  }
  window.setAuthMode=function(mode){
    if(authBusy)return;
    authMode=mode==='signup'?'signup':'login';
    var oldRole=$('role').value||'supplier',signup=authMode==='signup';
    if(signup&&oldRole==='admin')oldRole='supplier';
    $('authTitle').textContent=signup?'إنشاء حساب جديد':'تسجيل الدخول';
    $('authSubtitle').textContent=signup?'أنشئ حساب عميل أو مورد وابدأ مباشرة ثم أكمل بيانات الشركة للتوثيق.':'ادخل إلى حسابك لإدارة المشتريات أو التوريد.';
    $('loginModeButton').classList.toggle('active',!signup);$('signupModeButton').classList.toggle('active',signup);
    $('confirmPasswordWrap').classList.toggle('hidden',!signup);$('confirmPassword').required=signup;
    $('password').setAttribute('autocomplete',signup?'new-password':'current-password');$('password').placeholder=signup?'8 أحرف على الأقل':'أدخل كلمة المرور';
    $('role').innerHTML=signup?'<option value="buyer">عميل / قسم مشتريات</option><option value="supplier">مورد</option>':'<option value="buyer">عميل / قسم مشتريات</option><option value="supplier">مورد</option><option value="admin">إدارة صِلَة</option>';
    $('role').value=oldRole;
    $('authSubmit').textContent=signup?'إنشاء الحساب':'تسجيل الدخول';
    $('authFootnote').innerHTML=signup?'<b>دخول فوري:</b> لا توجد رسالة تأكيد للبريد. أكمل بيانات شركتك ثم أرسل ملفك للمراجعة والتوثيق.':'اختر البوابة المطابقة للحساب الذي أنشأته. حسابات الإدارة تُنشأ من داخل النظام وليست متاحة للتسجيل الذاتي.';
    roleNote();
  }
  window.roleNote=function(){
    var r=$('role').value,signup=authMode==='signup';
    $('roleNote').innerHTML=r==='buyer'?'<div><b>بوابة العميل</b>'+ (signup?'أنشئ حساب شركتك ثم أضف طلبات الشراء واستقبل العروض.':'تابع طلبات الشراء والعروض وأوامر التوريد الخاصة بشركتك.')+'</div>':r==='supplier'?'<div><b>بوابة المورد المؤسس</b>'+ (signup?'جهّز ملف شركتك مجانًا ثم أضف المستندات للتوثيق واستقبل الطلبات.':'قدّم عروضًا تفصيلية وتابع كل أمر توريد بثقة.')+'</div>':'<div><b>لوحة إدارة صِلَة</b>هذا الدخول مخصص للحسابات التي أنشأها مالك النظام فقط.</div>';
  }
  function setAuthBusy(value){
    authBusy=!!value;$('authSubmit').disabled=authBusy;$('loginModeButton').disabled=authBusy;$('signupModeButton').disabled=authBusy;
    $('authSubmit').textContent=authBusy?'جارٍ التنفيذ…':(authMode==='signup'?'إنشاء الحساب':'تسجيل الدخول');
  }
  $('loginForm').addEventListener('submit',async function(e){
    e.preventDefault();
    if(authBusy)return;
    var email=$('email').value.trim().toLowerCase(),pass=$('password').value,confirmPassword=$('confirmPassword').value,role=$('role').value,mode=authMode;
    if(!email||!pass)return;
    if(mode==='signup'&&pass.length<8){flash('استخدم كلمة مرور من 8 أحرف على الأقل.');return}
    if(mode==='signup'&&pass!==confirmPassword){flash('تأكيد كلمة المرور غير مطابق.');return}
    if(mode==='signup'&&role==='admin'){flash('لا يمكن إنشاء حساب إدارة من هذه الشاشة.');return}
    if(!cloudConfigured()){flash('خدمة الحسابات غير مهيأة الآن. راجع إعداد Supabase.');return}
    setAuthBusy(true);
    try{
      var authData=mode==='signup'?await window.SilahCloud.signUp(email,pass,role):await window.SilahCloud.signIn(email,pass);
      if(mode==='signup'&&!authData.session)throw new Error('signup-session-missing');
      var user=authData.user||(authData.session&&authData.session.user);if(!user)throw new Error('auth-session-missing');
      var remoteProfile=await window.SilahCloud.waitForMyProfile(10,250);if(!remoteProfile)throw new Error('profile-pending');
      if(remoteProfile.role!==role){try{await window.SilahCloud.signOut()}catch(ignore){}throw new Error('role-mismatch')}
      session={email:user.email,role:remoteProfile.role,userId:user.id,cloud:true};localStorage.setItem(SESSION_KEY,JSON.stringify(session));active='dashboard';await syncCloud();subscribeCloud();
      var current=me();
      if(current&&!complete(current)){active='profile';render();flash(mode==='signup'?'تم إنشاء الحساب. أكمل ملف الشركة للبدء.':'أكمل ملف الشركة أولًا ليظهر حسابك بصورة احترافية')}
      else flash(mode==='signup'?'تم إنشاء الحساب وتسجيل الدخول بنجاح.':'تم تسجيل الدخول بنجاح.');
    }catch(err){flash((mode==='signup'?'تعذر إنشاء الحساب: ':'تعذر تسجيل الدخول: ')+cloudMessage(err))}
    finally{setAuthBusy(false)}
  });
  window.logout=async function(){var wasCloud=usingCloud();if(wasCloud)window.SilahCloud.unsubscribe();session=null;db=baseDB();cacheDB();active='dashboard';localStorage.removeItem(SESSION_KEY);render();if(wasCloud){try{await window.SilahCloud.signOut()}catch(e){}}}
  window.setTab=function(tab){active=tab;renderApp();window.scrollTo({top:0,behavior:'smooth'})}
  window.closeModal=closeModal;

  function buyerCredit(){
    var p=me(),used=outstanding(session.email),free=Math.max(0,Number(p.creditLimit||0)-used),pending=db.credits.find(function(c){return c.buyerEmail===session.email&&c.status==='قيد المراجعة'});
    var body='<div class="score-grid"><div class="score"><span>الحد الائتماني</span><b>'+smallMoney(p.creditLimit||0)+'</b></div><div class="score"><span>مستخدم في أوامر نشطة</span><b>'+smallMoney(used)+'</b></div><div class="score"><span>المتاح حاليًا</span><b>'+smallMoney(free)+'</b></div></div><div class="cards" style="margin-top:13px"><div class="card"><div class="title">الموثوقية المالية</div><b class="money" style="font-size:26px">'+(p.financial||'جديد')+(p.financial?' / 100':'')+'</b><p class="muted small">يعتمد القرار النهائي على موافقة المورد وشروطه، وليس على صِلَة وحدها.</p></div><div class="card"><div class="title">حالة الائتمان</div>'+status(p.creditRestricted?'مقيد':'نشط')+'<p class="muted small">'+(p.creditRestricted?'تم تقييد الحساب الائتماني لحين مراجعة الإدارة.':'يمكن للمورد تحديد الشروط والحد الائتماني المناسبين لكل عميل.')+'</p></div></div>';
    return panel('الائتمان والثقة','الشراء الآجل قرار تجاري بين المورد والعميل مع سجل واضح داخل صِلَة.',pending?'<span class="badge orange">طلبك قيد المراجعة</span>':'<button type="button" class="btn primary" onclick="openCredit()">طلب حد ائتماني</button>',body);
  }
  function profileView(){
    var p=me(),r=rating(p.email,p.role)||p.rating||0,first=esc((p.company||p.name||p.email||'ص').charAt(0));
    var body='<div class="profile-hero"><div class="profile-main"><div class="avatar">'+first+'</div><div><h3>'+esc(p.company||p.name||'أكمل بيانات شركتك')+'</h3><p>'+esc(p.email)+' · '+esc(p.city||'')+'</p>'+documentChips(p)+'</div></div>'+status(p.verification||'غير مكتمل')+'</div><div class="score-grid"><div class="score"><span>تقييم الشبكة</span><b>'+ (r||'جديد') +(r?' / 5':'')+'</b></div><div class="score"><span>الثقة التشغيلية</span><b>'+ (p.operational||'جديد') +(p.operational?' / 100':'')+'</b></div><div class="score"><span>الثقة المالية</span><b>'+ (p.financial||'جديد') +(p.financial?' / 100':'')+'</b></div></div><div class="cards" style="margin-top:13px"><div class="card"><div class="title">بيانات التواصل</div><div class="meta"><span>المسؤول: '+esc(p.contact||'غير مكتمل')+'</span><span>هاتف / واتساب: '+esc(p.phone||'غير مكتمل')+'</span><span>المحافظة: '+esc(p.city||'غير مكتمل')+'</span></div></div><div class="card"><div class="title">'+(p.role==='supplier'?'قدرات التوريد':'بيانات الشراء')+'</div><div class="meta"><span>الفئات: '+esc((p.categories||[]).join('، ')||'غير محددة')+'</span><span>'+ (p.role==='supplier'?'الماركات: '+esc(p.brands||'غير محددة'):'شروط الدفع: '+esc(p.paymentTerms||'غير محددة')) +'</span><span>'+ (p.role==='supplier'?'مدة التوريد: '+esc(p.leadTime||'—')+' يوم':'حد الائتمان: '+smallMoney(p.creditLimit||0))+'</span></div></div></div><div class="card" style="margin-top:13px"><div class="title">مستندات التحقق</div><p class="muted small">تُعرض وثائق الشركة للموردين والعملاء المسجلين بعد اعتماد الحساب، ولا تظهر أي بيانات هوية شخصية للمفوض.</p>'+documentPanel(p)+'</div>';
    return panel(p.role==='supplier'?'ملف المورد والتوثيق':'ملف الشركة والثقة','السجل التجاري والضريبي والمفوض بالتوقيع متاحون للطرف الآخر بعد اعتماد الإدارة.','<button type="button" class="btn primary" onclick="openProfile()">تعديل الملف</button>',body);
  }
  function ratingsView(){
    var a=db.ratings.filter(function(r){return r.toEmail===session.email&&r.toRole===session.role});
    var rows=a.map(function(r){return '<article class="card"><div class="card-row"><div><div class="title">'+esc(nameOf(r.fromEmail,r.fromRole))+'</div><div class="small muted">'+date(r.createdAt)+'</div></div><span class="badge orange">★ '+esc(r.overall)+' / 5</span></div><div class="meta"><span>التوريد: '+esc(r.delivery)+'</span><span>الجودة: '+esc(r.quality)+'</span><span>التواصل: '+esc(r.communication)+'</span></div><p class="muted small">'+esc(r.comment||'—')+'</p></article>'});
    return panel('التقييمات والثقة','التقييم المتبادل يظهر بعد استلام العميل ويغذي مؤشر الثقة التشغيلية.','',rows.length?cards(rows):empty('لا توجد تقييمات مستلمة بعد','بعد إتمام أمر توريد يمكن للطرفين إضافة تقييم متبادل.'));
  }
  function activityView(title){
    var a=db.activity.slice(0,25).map(function(x){return '<div class="time"><i></i><div><b>'+esc(x.text)+'</b><small>'+time(x.createdAt)+' · '+esc(x.actor||'النظام')+'</small></div></div>'});
    return panel(title,'سجل واضح لكل خطوة تشغيلية داخل المنصة.','',a.length?'<div class="timeline">'+a.join('')+'</div>':empty('لا توجد عمليات بعد','ستظهر الأنشطة هنا عند استخدام النظام.'));
  }
  function adminProfiles(){
    var rows=db.profiles.filter(function(p){return p.role!=='admin'}).map(function(p){var buttons=(p.verification!=='موثق'?cmd('reviewProfile',[p.id,'موثق'],'اعتماد','primary'):'')+cmd('reviewProfile',[p.id,'مرفوض'],'رفض','danger')+cmd('adminProfile',p.id,'عرض الملف');return '<article class="card"><div class="card-row"><div><div class="title">'+esc(p.company||p.name||p.email)+'</div><div class="small muted">'+roleName(p.role)+' · '+esc(p.contact||'بدون مسؤول')+' · '+esc(p.city||'—')+'</div></div>'+status(p.verification)+'</div><div class="meta"><span>هاتف: '+esc(p.phone||'—')+'</span><span>الفئات: '+esc((p.categories||[]).join('، ')||'—')+'</span><span>تقييم: '+(rating(p.email,p.role)||p.rating||'جديد')+'</span></div>'+documentChips(p)+'<div class="actions" style="margin-top:11px">'+buttons+'</div></article>'});
    return panel('التحقق والحسابات','اعتمد الحساب فقط بعد مراجعة بيانات الشركة ووثائقها.','',cards(rows));
  }
  function adminCredit(){
    var pending=db.credits.filter(function(c){return c.status==='قيد المراجعة'}).map(function(c){var p=pFor(c.buyerEmail,'buyer');return '<article class="card"><div class="card-row"><div><div class="title">'+esc(p.company||p.email)+'</div><div class="small muted">طلب حد '+smallMoney(c.amount)+' لمدة '+esc(c.days)+' يوم</div></div>'+status(c.status)+'</div><p class="muted small">'+esc(c.reason||'—')+'</p><div class="actions">'+cmd('reviewCredit',[c.id,'معتمد'],'اعتماد','primary')+cmd('reviewCredit',[c.id,'مرفوض'],'رفض','danger')+'</div></article>'});
    var buyers=db.profiles.filter(function(p){return p.role==='buyer'}).map(function(p){return '<article class="card"><div class="card-row"><div><b>'+esc(p.company||p.email)+'</b><div class="small muted">مالي: '+(p.financial||'جديد')+' · تشغيل: '+(p.operational||'جديد')+'</div></div>'+status(p.creditRestricted?'مقيد':'نشط')+'</div><div class="meta"><span>حد: '+smallMoney(p.creditLimit||0)+'</span><span>مستخدم: '+smallMoney(outstanding(p.email))+'</span></div><div class="actions">'+cmd('restrictCredit',[p.id,p.creditRestricted?'false':'true'],p.creditRestricted?'رفع القيد':'تقييد الائتمان',p.creditRestricted?'soft':'warn')+'</div></article>'});
    return panel('الائتمان والمخاطر','الحدود والشروط تساعد القرار ولا تحل محل موافقة المورد الائتمانية.','', '<div class="section-head" style="margin:0 0 12px"><div><h2 style="font-size:16px">طلبات قيد المراجعة</h2></div></div>'+cards(pending)+'<div class="section-head" style="margin:22px 0 12px"><div><h2 style="font-size:16px">حالة العملاء</h2></div></div>'+cards(buyers));
  }
  function disputesView(){
    var rows=db.disputes.map(function(d){var p=db.pos.find(function(x){return x.id===d.poId}),a=cmd('disputeDetails',d.id,'التفاصيل');if(d.status==='مفتوح')a+=cmd('solveDispute',[d.id,'تم الحل'],'إغلاق بعد الحل','primary');return '<article class="card"><div class="card-row"><div><div class="title">'+esc(d.number||d.id)+'</div><div class="small muted">أمر: '+esc(p?p.number:'—')+' · فتحه: '+esc(nameOf(d.openedByEmail,d.openedByRole))+'</div></div>'+status(d.status)+'</div><p class="small"><b>السبب:</b> '+esc(d.reason)+'</p><p class="muted small">'+esc(d.details)+'</p><div class="actions">'+a+'</div></article>'});
    return panel('النزاعات','سجل نزاع مستقل مع أثر زمني واضح حتى يتم الحل.','',cards(rows));
  }
  function networkRatings(){
    var rows=db.profiles.filter(function(p){return p.role==='supplier'}).map(function(p){var rs=db.ratings.filter(function(r){return r.toEmail===p.email&&r.toRole==='supplier'});return '<article class="card"><div class="card-row"><div><div class="title">'+esc(p.company||p.email)+'</div><div class="small muted">موثوقية تشغيلية: '+(p.operational||'جديد')+'</div></div><span class="badge orange">★ '+(rating(p.email,'supplier')||'جديد')+'</span></div><div class="meta"><span>تقييمات: '+rs.length+'</span><span>الحالة: '+esc(p.verification)+'</span><span>التوريد: '+esc(p.leadTime||'—')+' يوم</span></div></article>'});
    return panel('جودة شبكة الموردين','عرض مؤشرات التشغيل والتقييمات؛ لا يختلط التقييم بالخطر المالي.','',cards(rows));
  }
  function settingsView(){return panel('سياسة الإطلاق','هذه الضوابط تظهر للمورد والعميل بصياغة واضحة في النسخة النهائية.','', '<div class="cards"><div class="card"><div class="title">المورد المؤسس</div><p class="muted small">التسجيل وتجهيز الحساب مجانًا، أول 3 مبيعات ناجحة بلا رسوم، وتظهر أي رسوم نجاح لاحقة قبل تقديم العرض.</p></div><div class="card"><div class="title">العميل المؤسس</div><p class="muted small">طلب شراء حقيقي واحد مجانًا، ثم يختار العميل الاشتراك. يحصل العميل المؤسس على سعر ودعم تمهيديين لفترة الإطلاق.</p></div><div class="card"><div class="title">نموذج التدفق المالي</div><p class="muted small">صِلَة لا تشتري ولا تخزن البضاعة. المورد يفوتر العميل والعميل يسدد له مباشرة؛ صِلَة تفوتر خدمتها منفصلة.</p></div><div class="card"><div class="title">سوق الإطلاق</div><p class="muted small">القاهرة الكبرى، مع تركيز أولي على مواسير ووصلات السباكة PPR / PVC / UPVC.</p></div></div>')}

  window.openRequest=function(){
    var p=me(),due=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
    var html=modalHead('طلب شراء جديد','أدخل الأصناف يدويًا، أو أرفق ملف Excel أو PDF أو صورة فيها جميع البنود.')+'<div class="form"><div class="grid2"><label class="label">اسم الشركة <span class="required">*</span><input id="rCompany" value="'+esc(p.company||'')+'"></label><label class="label">اسم المشروع <span class="required">*</span><input id="rProject" placeholder="مثال: تشطيب فيلا بالتجمع"></label><label class="label">الفئة <span class="required">*</span><select id="rCategory"><option>سباكة ومواسير PPR</option><option>مواسير PVC / UPVC</option><option>أدوات صحية</option><option>كهرباء وإضاءة</option><option>دهانات وتشطيبات</option><option>أخرى</option></select></label><label class="label">مكان التوريد <span class="required">*</span><input id="rLocation" value="'+esc(p.city||'')+'" placeholder="المنطقة / الموقع"></label><label class="label">آخر موعد للعروض <span class="required">*</span><input id="rDeadline" type="date" value="'+due+'"></label><label class="label">شروط الدفع المطلوبة <select id="rPayment"><option>نقدي</option><option>أجل 15 يوم</option><option selected>أجل 30 يوم</option><option>أجل 60 يوم</option><option>أجل 90 يوم</option></select></label><label class="label">مرفقات الطلب <input id="rFiles" type="file" multiple accept=".pdf,.xlsx,.xls,.doc,.docx,.jpg,.jpeg,.png,.webp"><small class="form-note">يمكن رفع Excel أو PDF أو Word أو صور. يستطيع المورد فتحها أو تنزيلها بعد النشر.</small></label></div><label class="label">ملاحظات للموردين<textarea id="rNotes" placeholder="الماركة المطلوبة، دفعات التوريد، متطلبات الجودة..."></textarea></label><div><div class="card-row"><div><b>بنود الطلب <span class="muted small">(اختياري عند إرفاق ملف الأصناف)</span></b><p class="form-note">استخدم البنود اليدوية للمقارنة الذكية بندًا ببند، أو اتركها فارغة إذا كانت كل التفاصيل داخل المرفق.</p></div><button type="button" class="btn soft tiny" onclick="addLine()">+ إضافة بند</button></div><div id="rItems" class="items"></div></div><button type="button" class="btn primary full" onclick="saveRequest()">نشر طلب الشراء</button></div>';
    openModal(html);
  }
  window.addLine=function(data){
    var box=$('rItems'),row=document.createElement('div');row.className='item';
    row.innerHTML='<label class="label item-name">الصنف <span class="required">*</span><input class="li-name" value="'+esc(data&&data.name||'')+'" placeholder="مثال: ماسورة PPR 20 مم"></label><label class="label">الكمية <span class="required">*</span><input class="li-qty" type="number" min="1" value="'+esc(data&&data.qty!==undefined?data.qty:'')+'"></label><label class="label">الوحدة <span class="required">*</span><input class="li-unit" value="'+esc(data&&data.unit||'')+'" placeholder="متر / قطعة"></label><label class="label">المواصفات<input class="li-spec" value="'+esc(data&&data.spec||'')+'" placeholder="ضغط / مقاس / ماركة"></label><button type="button" class="btn danger tiny" onclick="delLine(this)">حذف</button>';
    box.appendChild(row);
  }
  window.delLine=function(btn){btn.closest('.item').remove()}
  window.saveRequest=async function(){
    var company=$('rCompany').value.trim(),project=$('rProject').value.trim(),location=$('rLocation').value.trim(),deadline=$('rDeadline').value;
    if(!company)return modalError('اكتب اسم الشركة.');if(!project)return modalError('اكتب اسم المشروع.');if(!location)return modalError('اكتب مكان التوريد.');if(!deadline)return modalError('حدد آخر موعد للعروض.');
    var lines=Array.from(document.querySelectorAll('.item')),items=[];
    for(var i=0;i<lines.length;i++){var name=lines[i].querySelector('.li-name').value.trim(),qty=Number(lines[i].querySelector('.li-qty').value||0),unit=lines[i].querySelector('.li-unit').value.trim(),spec=lines[i].querySelector('.li-spec').value.trim(),started=!!(name||qty||unit||spec);if(!started)continue;if(!name||qty<=0||!unit)return modalError('أكمل اسم الصنف والكمية والوحدة في أي بند بدأت بإدخاله.');items.push({id:uid('IT'),name:name,qty:qty,unit:unit,spec:spec})}
    var attachments=[];
    try{attachments=await persistFiles($('rFiles').files||[],'rfq-attachments')}catch(e){return modalError(e.message||'تعذر حفظ المرفقات.')}
    if(!items.length&&!attachments.length)return modalError('أضف بندًا واحدًا على الأقل أو أرفق ملفًا أو صورة تحتوي على الأصناف المطلوبة.');
    var r={id:uid('RFQ'),number:'RFQ-'+next('rfq'),buyerEmail:session.email,company:company,project:project,category:$('rCategory').value,location:location,deadline:deadline,payment:$('rPayment').value,notes:$('rNotes').value.trim(),attachments:attachments,status:'مفتوح لاستقبال العروض',createdAt:now(),items:items};
    if(usingCloud()){
      try{r.number=await window.SilahCloud.nextNumber('rfq');var remote=await window.SilahCloud.createRfq(r);await Promise.all(attachments.map(function(file){return window.SilahCloud.createAttachment('rfq',remote.id,file)}));await syncCloud();closeModal();flash('تم نشر طلب الشراء وربطه بقاعدة البيانات.')}catch(e){return modalError(cloudMessage(e))}
      return;
    }
    db.rfqs.unshift(r);addLog('تم نشر '+r.number+' لاستقبال عروض الموردين.');closeModal();save();flash('تم نشر طلب الشراء بنجاح');
  }
  window.closeRequest=async function(id){var r=db.rfqs.find(function(x){return x.id===id});if(!r)return;if(!confirm('سيتم إغلاق الطلب ولن تظهر له عروض جديدة. هل تريد المتابعة؟'))return;if(usingCloud()){try{await window.SilahCloud.updateRfqStatus(id,'مغلق');await syncCloud();flash('تم إغلاق الطلب')}catch(e){flash(cloudMessage(e))}return}r.status='مغلق';addLog('تم إغلاق '+r.number);save();flash('تم إغلاق الطلب')}
  window.requestDetails=function(id){
    var r=db.rfqs.find(function(x){return x.id===id});if(!r)return;
    var rows=(r.items||[]).map(function(i){return '<tr><td>'+esc(i.name)+'</td><td>'+esc(i.qty)+'</td><td>'+esc(i.unit)+'</td><td>'+esc(i.spec||'—')+'</td></tr>'}).join('');
    var itemsHtml=rows?'<div class="table-wrap"><table><thead><tr><th>الصنف</th><th>الكمية</th><th>الوحدة</th><th>المواصفات</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<div class="empty"><h3>الأصناف داخل المرفقات</h3><p class="small">هذا الطلب يعتمد على ملف أو صورة مرفقة. افتح المرفق لتسعير جميع البنود.</p></div>';
    var files=attachmentList(r.attachments,'لا توجد مرفقات.');
    var a='';
    if(session.role==='supplier'&&r.status==='مفتوح لاستقبال العروض')a+=cmd('openQuote',r.id,'تقديم عرض','primary');
    if(session.role==='supplier')a+=cmd('viewCompanyProfile',[r.buyerEmail,'buyer'],'ملف العميل والتوثيق','ghost');
    if((session.role==='admin'||session.role==='buyer'&&r.buyerEmail===session.email)&&db.quotes.some(function(q){return q.rfqId===r.id}))a+=cmd('compare',r.id,'المقارنة الذكية','navy');
    openModal(modalHead(esc(r.number)+' — '+esc(r.project),'تفاصيل طلب الشراء والبنود المتاحة للتسعير.')+'<div class="meta"><span>العميل: '+esc(r.company)+'</span><span>الفئة: '+esc(r.category)+'</span><span>المكان: '+esc(r.location)+'</span><span>الدفع: '+esc(r.payment)+'</span><span>آخر موعد: '+date(r.deadline)+'</span><span>الحالة: '+esc(r.status)+'</span></div><p class="small">'+esc(r.notes||'لا توجد ملاحظات إضافية.')+'</p>'+itemsHtml+'<h3 style="margin:16px 0 7px;font-size:15px">المرفقات</h3>'+files+'<div class="actions" style="margin-top:16px">'+a+'</div>');
  }

  function formQuoteBreakdown(){
    var baseInput=$('qBaseTotal'),manualTotal=amount(baseInput&&baseInput.value),lineTotal=Array.from(document.querySelectorAll('.quote-line')).reduce(function(sum,line){return sum+amount(line.querySelector('.q-price').value)*amount(line.getAttribute('data-qty'))},0),itemsTotal=lineTotal>0?round2(lineTotal):manualTotal;
    if(lineTotal>0&&baseInput)baseInput.value=itemsTotal;
    var discountRate=Math.min(100,amount($('qDiscountRate')&&$('qDiscountRate').value)),discount=round2(itemsTotal*discountRate/100),net=round2(itemsTotal-discount),taxRate=Math.min(100,amount($('qTaxRate')&&$('qTaxRate').value)),tax=round2(net*taxRate/100),shipping=amount($('qShipping')&&$('qShipping').value),other=amount($('qOther')&&$('qOther').value);
    return {itemsTotal:itemsTotal,discount:discount,discountRate:discountRate,net:net,tax:tax,taxRate:taxRate,shipping:shipping,other:other,total:round2(net+tax+shipping+other)};
  }
  window.updateQuoteSummary=function(){var box=$('qFinanceBreakdown');if(box)box.innerHTML=pricingHtml(formQuoteBreakdown(),'live')}

  window.openQuote=function(rfqId){
    var r=db.rfqs.find(function(x){return x.id===rfqId});if(!r)return;
    var old=db.quotes.find(function(q){return q.rfqId===rfqId&&q.supplierEmail===session.email}),p=me(),oldItems=old?old.items:[];
    var lines=r.items.map(function(it){
      var o=oldItems.find(function(x){return x.itemId===it.id})||{};
      return '<div class="quote-item quote-line" data-id="'+esc(it.id)+'" data-qty="'+esc(it.qty)+'"><div><b>'+esc(it.name)+'</b><small class="muted">'+esc(it.qty)+' '+esc(it.unit)+' · '+esc(it.spec||'—')+'</small></div><label class="label">سعر الوحدة<input class="q-price" type="number" min="0" step="0.01" oninput="updateQuoteSummary()" value="'+esc(o.unitPrice||'')+'"></label><label class="label">التوفر<select class="q-available"><option '+(o.availability==='متوفر'?'selected':'')+'>متوفر</option><option '+(o.availability==='متوفر جزئيًا'?'selected':'')+'>متوفر جزئيًا</option><option '+(o.availability==='غير متوفر'?'selected':'')+'>غير متوفر</option></select></label><label class="label">الماركة<input class="q-brand" value="'+esc(o.brand||'')+'"></label><label class="label">المنشأ<input class="q-origin" value="'+esc(o.origin||'')+'"></label><label class="label">الضمان / البديل<input class="q-warranty" value="'+esc(o.warranty||'')+'"></label></div>';
    }).join('');
    var itemSection=lines?'<div><h3 style="font-size:15px;margin:0 0 8px">تسعير البنود داخل صِلَة</h3>'+lines+'</div>':'<div class="notice"><div><b>الطلب يعتمد على مرفقاته</b>حمّل ملف الأصناف أو الصورة أدناه، ثم أرفق عرض السعر كاملاً كـ Excel أو PDF أو صورة.</div></div>';
    var oldAttachments=old&&old.attachments&&old.attachments.length?'<div class="card"><div class="title">المرفقات الموجودة في عرضك</div>'+attachmentList(old.attachments)+'</div>':'';
    var prior=quoteBreakdown(old||{}),initialBase=old?(old.items&&old.items.length?old.itemsTotal:(old.manualTotal||old.itemsTotal||0)):0;
    var html=modalHead(old?'تحديث عرض السعر':'عرض سعر للمورد','يمكنك تسعير البنود داخل صِلَة، أو إرفاق عرض سعر كامل، أو استخدام الطريقتين معًا.')
      +'<div class="form"><div class="card"><div class="title">مرفقات طلب الشراء</div><p class="muted small">افتح ملف الأصناف أو الصورة قبل إعداد عرضك.</p>'+attachmentList(r.attachments,'لم يرفق العميل ملفات إضافية.')+'</div>'
      +'<div class="grid3"><label class="label">اسم المورد <span class="required">*</span><input id="qSupplier" value="'+esc(old?old.supplier:p.company||'')+'"></label><label class="label">مدة التوريد (يوم)<input id="qDays" type="number" min="1" value="'+esc(old?old.deliveryDays:p.leadTime||3)+'"></label><label class="label">صلاحية العرض (أيام)<input id="qValidity" type="number" min="1" value="'+esc(old?old.validity:7)+'"></label></div>'
      +itemSection
      +'<div class="card finance-card"><div class="card-row"><div><div class="title">التفصيل المالي للعرض</div><p class="muted small">يظهر هذا التفصيل للعميل والإدارة قبل إصدار أمر الشراء.</p></div></div><div class="grid3"><label class="label">إجمالي البنود قبل الخصم <span class="muted small">(يُحسب من البنود أو يُدخل للعرض المرفق)</span><input id="qBaseTotal" type="number" min="0" step="0.01" oninput="updateQuoteSummary()" value="'+esc(initialBase)+'"></label><label class="label">نسبة الخصم %<input id="qDiscountRate" type="number" min="0" max="100" step="0.01" oninput="updateQuoteSummary()" value="'+esc(prior.discountRate)+'"></label><label class="label">نسبة ضريبة القيمة المضافة %<input id="qTaxRate" type="number" min="0" max="100" step="0.01" oninput="updateQuoteSummary()" value="'+esc(prior.taxRate)+'"></label><label class="label">مصاريف النقل<input id="qShipping" type="number" min="0" step="0.01" oninput="updateQuoteSummary()" value="'+esc(prior.shipping)+'"></label><label class="label">رسوم إضافية <span class="muted small">(اختياري)</span><input id="qOther" type="number" min="0" step="0.01" oninput="updateQuoteSummary()" value="'+esc(prior.other)+'"></label></div><p class="form-note">الخصم يُحسب من إجمالي البنود، والضريبة تُحسب من صافي البنود بعد الخصم، ثم تُضاف مصاريف النقل والرسوم الأخرى.</p><div id="qFinanceBreakdown"></div></div>'
      +'<div class="grid2"><label class="label">شروط الدفع <input id="qPayment" value="'+esc(old?old.payment:p.paymentTerms||'نقدي')+'"></label><label class="label">ملاحظات للعميل<textarea id="qNotes">'+esc(old?old.notes||'':'')+'</textarea></label></div><label class="label">رفع عرض السعر <input id="qFiles" type="file" multiple accept=".pdf,.xlsx,.xls,.doc,.docx,.jpg,.jpeg,.png,.webp"><small class="form-note">ارفع Excel أو PDF أو صورة عرض السعر. يراها العميل والإدارة ويمكنهم فتحها أو تنزيلها.</small></label>'+oldAttachments+'<div class="notice"><div><b>سياسة المورد المؤسس</b>أول 3 مبيعات ناجحة بلا رسوم، وبعدها تظهر أي رسوم نجاح بوضوح قبل تقديم العرض.</div></div><button type="button" class="btn primary full" onclick="saveQuote(&quot;'+esc(rfqId)+'&quot;)">'+(old?'حفظ تحديث العرض':'إرسال العرض')+'</button></div>';
    openModal(html);setTimeout(window.updateQuoteSummary,0);
  }
  window.saveQuote=async function(rfqId){
    var r=db.rfqs.find(function(x){return x.id===rfqId});if(!r)return;
    var supplier=$('qSupplier').value.trim();if(!supplier)return modalError('اكتب اسم المورد.');
    var lines=Array.from(document.querySelectorAll('.quote-line')),items=[],sum=0,finance=formQuoteBreakdown();
    for(var i=0;i<lines.length;i++){
      var id=lines[i].getAttribute('data-id'),src=r.items.find(function(x){return x.id===id}),price=Number(lines[i].querySelector('.q-price').value||0),availability=lines[i].querySelector('.q-available').value;
      if(price<0)return modalError('سعر الوحدة لا يمكن أن يكون سالبًا.');
      var sub=price*Number(src.qty||0);sum+=sub;
      items.push({itemId:id,name:src.name,qty:src.qty,unit:src.unit,unitPrice:price,subtotal:sub,availability:availability,brand:lines[i].querySelector('.q-brand').value.trim(),origin:lines[i].querySelector('.q-origin').value.trim(),warranty:lines[i].querySelector('.q-warranty').value.trim()});
    }
    var old=db.quotes.find(function(q){return q.rfqId===rfqId&&q.supplierEmail===session.email});
    var uploads=[];
    try{uploads=await persistFiles($('qFiles').files||[],'quote-attachments')}catch(e){return modalError(e.message||'تعذر حفظ مرفقات عرض السعر.')}
    var attachments=(old&&old.attachments?old.attachments:[]).concat(uploads),hasLinePrice=sum>0;
    if(!hasLinePrice&&!finance.itemsTotal&&!attachments.length)return modalError('أدخل تسعيرًا داخل صِلَة أو أرفق عرض سعر Excel أو PDF أو صورة.');
    var data={id:old?old.id:uid('Q'),number:old?old.number:'Q-'+next('quote'),rfqId:rfqId,supplierEmail:session.email,supplier:supplier,items:items,itemsTotal:finance.itemsTotal,manualTotal:hasLinePrice?0:finance.itemsTotal,discount:finance.discount,discountRate:finance.discountRate,shipping:finance.shipping,tax:finance.tax,taxRate:finance.taxRate,other:finance.other,total:finance.total,deliveryDays:Number($('qDays').value||0),validity:Number($('qValidity').value||0),payment:$('qPayment').value.trim(),notes:$('qNotes').value.trim(),attachments:attachments,status:old?old.status||'مُرسل':'مُرسل',createdAt:old?old.createdAt:now(),updatedAt:now()};
    if(usingCloud()){
      try{if(!old)data.number=await window.SilahCloud.nextNumber('quote');var remote=await window.SilahCloud.submitQuote(data);await Promise.all(uploads.map(function(file){return window.SilahCloud.createAttachment('quote',remote.id,file)}));await syncCloud();closeModal();flash(old?'تم تحديث العرض في قاعدة البيانات':'تم إرسال العرض وربطه بقاعدة البيانات')}catch(e){return modalError(cloudMessage(e))}
      return;
    }
    if(old)Object.assign(old,data);else db.quotes.unshift(data);
    addLog((old?'تم تحديث ':'وصل ')+'عرض '+data.number+' على '+r.number);closeModal();save();flash(old?'تم تحديث العرض':'تم إرسال العرض');
  }
  window.quoteDetails=function(id){
    var q=db.quotes.find(function(x){return x.id===id});if(!q)return;var r=db.rfqs.find(function(x){return x.id===q.rfqId});
    var rows=(q.items||[]).map(function(i){return '<tr><td>'+esc(i.name)+'</td><td>'+esc(i.qty)+' '+esc(i.unit)+'</td><td>'+money(i.unitPrice)+'</td><td>'+money(i.subtotal)+'</td><td>'+esc(i.availability)+'</td><td>'+esc(i.brand||'—')+'</td><td>'+esc(i.origin||'—')+'</td><td>'+esc(i.warranty||'—')+'</td></tr>'}).join('');
    var itemsHtml=rows?'<div class="table-wrap"><table><thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th>التوفر</th><th>الماركة</th><th>المنشأ</th><th>الضمان</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<div class="empty"><h3>التسعير موجود في المرفق</h3><p class="small">افتح ملف أو صورة عرض السعر للاطلاع على تفاصيل البنود.</p></div>';
    var actions=(session.role==='buyer'||session.role==='admin')?'<div class="actions" style="margin-top:14px">'+cmd('viewCompanyProfile',[q.supplierEmail,'supplier'],'ملف المورد والتوثيق','ghost')+'</div>':'';
    openModal(modalHead('عرض '+esc(q.number),'عرض من '+esc(q.supplier)+' على '+esc(r?r.number:'طلب')+'.')+'<div class="meta"><span>الإجمالي النهائي: '+(Number(total(q)||0)?money(total(q)):'راجع المرفق')+'</span><span>التسليم: '+esc(q.deliveryDays)+' يوم</span><span>صلاحية العرض: '+esc(q.validity||'—')+' أيام</span></div><h3 style="margin:16px 0 7px;font-size:15px">التفصيل المالي</h3>'+pricingHtml(q,'quote-breakdown')+itemsHtml+'<h3 style="margin:16px 0 7px;font-size:15px">مرفقات عرض السعر</h3>'+attachmentList(q.attachments,'لا توجد مرفقات إضافية.')+'<p class="muted small" style="margin-top:13px"><b>شروط الدفع:</b> '+esc(q.payment||'—')+'<br><b>ملاحظات:</b> '+esc(q.notes||'—')+'</p>'+actions);
  }
  window.compare=function(rfqId){
    var r=db.rfqs.find(function(x){return x.id===rfqId});if(!r)return;var q=db.quotes.filter(function(x){return x.rfqId===rfqId});
    if(!q.length){flash('لا توجد عروض للمقارنة بعد.');return}
    if(!(r.items||[]).length){window.compareAttachmentOnly(rfqId);return}
    var rows=r.items.map(function(item){
      var all=q.filter(function(x){return valid(x,item.id)}).sort(function(a,b){return Number(qItem(a,item.id).subtotal)-Number(qItem(b,item.id).subtotal)});
      var opts='<option value="">اختر المورد</option>'+all.map(function(x){var i=qItem(x,item.id);return '<option value="'+esc(x.id)+'" '+(x.id===(all[0]&&all[0].id)?'selected':'')+'>'+esc(x.supplier)+' — '+money(i.subtotal)+' ('+esc(i.availability)+')</option>'}).join('');
      return '<tr><td><b>'+esc(item.name)+'</b><br><small class="muted">'+esc(item.qty)+' '+esc(item.unit)+' · '+esc(item.spec||'—')+'</small></td><td><select class="compare-select" data-item="'+esc(item.id)+'" onchange="recalc(&quot;'+esc(r.id)+'&quot;)">'+opts+'</select></td><td id="cp-'+esc(item.id)+'">'+(all.length?money(qItem(all[0],item.id).subtotal):'—')+'</td><td>'+(all.length?esc(qItem(all[0],item.id).availability):'لا يوجد عرض صالح')+'</td></tr>';
    }).join('');
    openModal(modalHead('المقارنة الذكية وتقسيم الطلب','اختر موردًا لكل بند. الاقتراح الافتراضي هو أقل عرض صالح للبند.')+'<div class="notice"><div><b>الاختيار ليس تلقائيًا</b>يمكنك تغيير المورد المقترح حسب الجودة والماركة ومدة التوريد، ثم إصدار أوامر شراء منفصلة تلقائيًا.</div></div><div class="table-wrap"><table><thead><tr><th>البند</th><th>المورد المختار</th><th>إجمالي البند</th><th>التوفر</th></tr></thead><tbody>'+rows+'</tbody></table></div><div id="compareSummary"></div><div class="actions" style="margin-top:15px"><button type="button" class="btn primary" onclick="createOrders(&quot;'+esc(r.id)+'&quot;)">إصدار أوامر الشراء المختارة</button><button type="button" class="btn ghost" onclick="closeModal()">رجوع</button></div>');
    recalc(rfqId);
  }
  window.compareAttachmentOnly=function(rfqId){
    var r=db.rfqs.find(function(x){return x.id===rfqId});if(!r)return;var quotes=db.quotes.filter(function(q){return q.rfqId===rfqId});
    var rows=quotes.map(function(q){var qTotal=Number(total(q)||0);return '<article class="card"><div class="card-row"><div><div class="title">'+esc(q.supplier)+'</div><div class="small muted">'+esc(q.number)+' · تسليم '+esc(q.deliveryDays)+' يوم</div></div><div>'+status(q.status||'مُرسل')+'</div></div><div class="meta"><span>الإجمالي النهائي: '+(qTotal?money(qTotal):'راجع المرفق')+'</span><span>الدفع: '+esc(q.payment||'—')+'</span></div>'+(qTotal?pricingHtml(q,'attachment-breakdown'):'')+attachmentList(q.attachments,'لم يرفق المورد ملف عرض السعر.')+'<label class="check" style="margin-top:10px"><input type="radio" name="attachmentQuote" value="'+esc(q.id)+'"> اختيار هذا العرض لإصدار أمر شراء</label></article>'}).join('');
    openModal(modalHead('مراجعة عروض الأسعار المرفقة','هذا الطلب تم إنشاؤه من ملف أو صورة، لذلك تكون المقارنة والمفاضلة هنا يدوية.')+'<div class="notice"><div><b>مراجعة قبل الاختيار</b>افتح عروض Excel أو الصور، ثم اختر عرضًا واحدًا. لإصدار أمر شراء يجب أن يكون المورد قد سجل إجمالي عرضه.</div></div><div class="cards">'+rows+'</div><div class="actions" style="margin-top:15px"><button type="button" class="btn primary" onclick="createAttachmentOrder(&quot;'+esc(r.id)+'&quot;)">إصدار أمر الشراء</button><button type="button" class="btn ghost" onclick="closeModal()">رجوع</button></div>');
  }
  window.createAttachmentOrder=async function(rfqId){
    var r=db.rfqs.find(function(x){return x.id===rfqId}),selected=document.querySelector('input[name="attachmentQuote"]:checked');if(!r||!selected)return modalError('اختر عرض سعر واحدًا أولًا.');
    var q=db.quotes.find(function(x){return x.id===selected.value});if(!q)return modalError('تعذر تحديد عرض السعر.');
    var orderTotal=Number(total(q)||0);if(orderTotal<=0)return modalError('يجب أن يسجل المورد إجمالي عرضه داخل صِلَة قبل إصدار أمر الشراء من المرفق.');
    var old=db.pos.filter(function(p){return p.rfqId===rfqId});if(usingCloud()&&old.length)return modalError('تم إصدار أمر شراء لهذا الطلب بالفعل. لا يمكن استبداله بعد الإصدار من النسخة السحابية.');if(old.length&&!confirm('سيتم استبدال أمر الشراء السابق لهذا الطلب. هل تريد المتابعة؟'))return;
    if(usingCloud()){
      try{var number=await window.SilahCloud.nextNumber('po');await window.SilahCloud.createPurchaseOrder({number:number,rfqId:r.id,quoteId:q.id,buyerId:r.buyerId,supplierId:q.supplierId,project:r.project,items:[{name:'بنود حسب عرض السعر المرفق',qty:1,unit:'طلب',unitPrice:orderTotal,subtotal:orderTotal}],pricing:quoteBreakdown(q),total:orderTotal,payment:q.payment||r.payment,deliveryDays:q.deliveryDays,notes:q.notes||''});await window.SilahCloud.updateRfqStatus(r.id,'تم إصدار أمر شراء');await syncCloud();closeModal();flash('تم إصدار أمر الشراء وربطه بقاعدة البيانات.')}catch(e){return modalError(cloudMessage(e))}
      return;
    }
    db.pos=db.pos.filter(function(p){return p.rfqId!==rfqId});
    db.pos.unshift({id:uid('PO'),number:'PO-'+next('po'),rfqId:r.id,rfqNumber:r.number,buyerEmail:r.buyerEmail,supplierEmail:q.supplierEmail,buyer:r.company,supplier:q.supplier,project:r.project,items:[{itemId:'ATTACHMENT',name:'بنود حسب عرض السعر المرفق',qty:1,unit:'طلب',unitPrice:orderTotal,subtotal:orderTotal}],pricing:quoteBreakdown(q),total:orderTotal,payment:q.payment||r.payment,deliveryDays:q.deliveryDays,status:'بانتظار تأكيد المورد',createdAt:now(),notes:q.notes||'',history:[{status:'بانتظار تأكيد المورد',actor:session.email,createdAt:now()}]});
    db.quotes.filter(function(x){return x.rfqId===rfqId}).forEach(function(x){x.status=x.id===q.id?'فاز كليًا':'لم يتم الاختيار'});
    r.status='تم إصدار أمر شراء';addLog('تم إصدار أمر شراء من عرض مرفق على '+r.number);closeModal();save();flash('تم إصدار أمر الشراء بنجاح');
  }
  window.recalc=function(rfqId){
    var r=db.rfqs.find(function(x){return x.id===rfqId});if(!r)return;var sels=Array.from(document.querySelectorAll('.compare-select')),groups={};
    sels.forEach(function(s){var q=db.quotes.find(function(x){return x.id===s.value}),item=r.items.find(function(x){return x.id===s.getAttribute('data-item')}),target=$('cp-'+item.id);if(!q){if(target)target.textContent='—';return}var qi=qItem(q,item.id);if(target)target.textContent=money(qi.subtotal);if(!groups[q.id])groups[q.id]={q:q,items:[]};groups[q.id].items.push(qi)});
    var selectedFinance={itemsTotal:0,discount:0,discountRate:0,net:0,tax:0,taxRate:0,shipping:0,other:0,total:0};
    Object.keys(groups).forEach(function(k){var b=allocatedBreakdown(groups[k].q,groups[k].items);['itemsTotal','discount','net','tax','shipping','other','total'].forEach(function(key){selectedFinance[key]=round2(selectedFinance[key]+b[key])})});
    var totalSplit=selectedFinance.total;
    var full=db.quotes.filter(function(q){return r.items.every(function(i){return valid(q,i.id)})}),single=full.length?Math.min.apply(null,full.map(total)):0;
    $('compareSummary').innerHTML='<div class="split-summary"><div><span>عدد أوامر الشراء</span><b>'+Object.keys(groups).length+'</b></div><div><span>إجمالي الاختيار الحالي</span><b>'+money(totalSplit)+'</b></div><div><span>وفر مقابل أفضل عرض موحد</span><b>'+(single?money(Math.max(0,single-totalSplit)):'لا يوجد عرض موحد')+'</b></div></div><div class="small muted" style="margin:0 0 6px">تفصيل مالي للاختيارات الحالية</div>'+pricingHtml(selectedFinance,'compare-breakdown');
  }
  window.createOrders=async function(rfqId){
    var r=db.rfqs.find(function(x){return x.id===rfqId});if(!r)return;var sels=Array.from(document.querySelectorAll('.compare-select')),groups={};
    for(var i=0;i<sels.length;i++){var q=db.quotes.find(function(x){return x.id===sels[i].value}),item=r.items.find(function(x){return x.id===sels[i].getAttribute('data-item')});if(!q)return modalError('اختر موردًا صالحًا لكل بند قبل إصدار الأمر.');var qi=qItem(q,item.id);if(!qi)return modalError('تعذر ربط بند بالعرض المختار.');if(!groups[q.id])groups[q.id]={q:q,items:[]};groups[q.id].items.push(qi)}
    var old=db.pos.filter(function(p){return p.rfqId===rfqId});if(usingCloud()&&old.length)return modalError('تم إصدار أوامر شراء لهذا الطلب بالفعل. لا يمكن استبدالها بعد الإصدار من النسخة السحابية.');if(old.length&&!confirm('سيتم استبدال أوامر الشراء السابقة لهذا الطلب بالاختيار الجديد. هل تريد المتابعة؟'))return;
    if(usingCloud()){
      try{
        for(var key in groups){if(Object.prototype.hasOwnProperty.call(groups,key)){var group=groups[key],quote=group.q,pricing=allocatedBreakdown(quote,group.items),poNumber=await window.SilahCloud.nextNumber('po');await window.SilahCloud.createPurchaseOrder({number:poNumber,rfqId:r.id,quoteId:quote.id,buyerId:r.buyerId,supplierId:quote.supplierId,project:r.project,items:group.items.map(function(item){return {quoteItemId:item.quoteItemId||item.id,name:item.name,qty:item.qty,unit:item.unit,unitPrice:item.unitPrice,subtotal:item.subtotal}}),pricing:pricing,total:pricing.total,payment:quote.payment||r.payment,deliveryDays:quote.deliveryDays,notes:quote.notes||''})}}
        await window.SilahCloud.updateRfqStatus(r.id,'تم إصدار أوامر شراء');await syncCloud();closeModal();flash('تم إصدار أوامر الشراء وربطها بقاعدة البيانات.');
      }catch(e){return modalError(cloudMessage(e))}
      return;
    }
    db.pos=db.pos.filter(function(p){return p.rfqId!==rfqId});
    Object.keys(groups).forEach(function(k){var g=groups[k],q=g.q,created=now(),pricing=allocatedBreakdown(q,g.items);db.pos.unshift({id:uid('PO'),number:'PO-'+next('po'),rfqId:r.id,rfqNumber:r.number,buyerEmail:r.buyerEmail,supplierEmail:q.supplierEmail,buyer:r.company,supplier:q.supplier,project:r.project,items:g.items.map(function(i){return {itemId:i.itemId,name:i.name,qty:i.qty,unit:i.unit,unitPrice:i.unitPrice,subtotal:i.subtotal}}),pricing:pricing,total:pricing.total,payment:q.payment||r.payment,deliveryDays:q.deliveryDays,status:'بانتظار تأكيد المورد',createdAt:created,updatedAt:created,notes:q.notes||'',history:[{status:'بانتظار تأكيد المورد',actor:session.email,createdAt:created}]})});
    db.quotes.filter(function(q){return q.rfqId===rfqId}).forEach(function(q){var g=groups[q.id];q.status=g?(g.items.length===r.items.length?'فاز كليًا':'فاز جزئيًا'):'لم يتم الاختيار'});
    r.status='تم إصدار أوامر شراء';addLog('تم إصدار '+Object.keys(groups).length+' أمر شراء من '+r.number);closeModal();save();flash('تم إصدار أوامر الشراء بنجاح');
  }

  window.poDetails=function(id){
    var p=db.pos.find(function(x){return x.id===id});if(!p)return;
    var rows=(p.items||[]).map(function(i){return '<tr><td>'+esc(i.name)+'</td><td>'+esc(i.qty)+' '+esc(i.unit)+'</td><td>'+money(i.unitPrice)+'</td><td>'+money(i.subtotal)+'</td></tr>'}).join('');
    var flow=['بانتظار تأكيد المورد','قيد التجهيز','خرج للتوريد','بانتظار تأكيد استلام العميل','مكتمل'],at=flow.indexOf(p.status);
    var steps=flow.map(function(x,i){return '<div class="step" style="min-width:125px;opacity:'+(i<=at?'1':'.45')+'"><i>'+(i+1)+'</i><b>'+esc(x)+'</b></div>'}).join('');
    var history=(p.history||[]).slice().reverse().map(function(h){var actor=h.role?nameOf(h.actor,h.role):(h.actor||'النظام');return '<div class="time"><i></i><div><b>'+esc(h.status)+'</b><small>'+time(h.createdAt)+' · '+esc(actor)+'</small></div></div>'}).join('')||'<p class="muted small">لا يوجد سجل تفصيلي قديم لهذا الأمر.</p>';
    var partnerAction=session.role==='supplier'?cmd('viewCompanyProfile',[p.buyerEmail,'buyer'],'ملف العميل والتوثيق','ghost'):session.role==='buyer'?cmd('viewCompanyProfile',[p.supplierEmail,'supplier'],'ملف المورد والتوثيق','ghost'):'';
    openModal(modalHead(esc(p.number),'أمر شراء مرتبط بـ '+esc(p.rfqNumber||'طلب شراء')+'.')+'<div class="meta"><span>العميل: '+esc(p.buyer||nameOf(p.buyerEmail,'buyer'))+'</span><span>المورد: '+esc(p.supplier)+'</span><span>الدفع: '+esc(p.payment||'—')+'</span><span>مدة التوريد: '+esc(p.deliveryDays||'—')+' يوم</span><span>الحالة: '+esc(p.status)+'</span></div><div class="table-wrap"><table><thead><tr><th>البند</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>'+rows+'</tbody></table></div><div class="split-summary"><div><span>إجمالي الأمر</span><b>'+money(p.total)+'</b></div><div><span>رقم الطلب</span><b>'+esc(p.rfqNumber||'—')+'</b></div><div><span>الفاتورة والدفع</span><b>مباشرة بين العميل والمورد</b></div></div>'+(p.pricing?'<h3 style="font-size:15px;margin:16px 0 7px">تفصيل عرض السعر المعتمد</h3>'+pricingHtml(p.pricing,'po-breakdown'):'')+'<div class="flow" style="grid-template-columns:repeat(5,1fr)">'+steps+'</div><h3 style="font-size:15px;margin:16px 0 7px">سجل تحديث الحالة</h3><div class="timeline">'+history+'</div><p class="muted small" style="margin-top:13px">'+esc(p.notes||'')+'</p><div class="actions" style="margin-top:12px">'+partnerAction+'</div>');
  }
  function changePoStatus(p,nextStatus){var stamp=now();p.status=nextStatus;p.updatedAt=stamp;if(!Array.isArray(p.history))p.history=[];p.history.push({status:nextStatus,actor:session?session.email:'system',role:session?session.role:'system',createdAt:stamp});addLog('تم تحديث '+p.number+' إلى: '+nextStatus)}
  window.advancePo=async function(id,nextStatus){
    var p=db.pos.find(function(x){return x.id===id}),allowed={'بانتظار تأكيد المورد':'قيد التجهيز','قيد التجهيز':'خرج للتوريد','خرج للتوريد':'بانتظار تأكيد استلام العميل'};
    if(!p||!session||session.role!=='supplier'||p.supplierEmail!==session.email){flash('هذا الإجراء متاح للمورد المسؤول عن الأمر فقط.');return}
    if(allowed[p.status]!==nextStatus){flash('حالة الأمر تغيّرت، حدّث الصفحة ثم حاول مرة أخرى.');return}
    if(usingCloud()){try{await window.SilahCloud.setOrderStatus(id,nextStatus);await syncCloud();closeModal();flash('تم تحديث حالة أمر التوريد.')}catch(e){flash(cloudMessage(e))}return}
    changePoStatus(p,nextStatus);closeModal();save();flash('تم تحديث حالة أمر التوريد.');
  }
  window.receivePo=async function(id){
    var p=db.pos.find(function(x){return x.id===id});
    if(!p||!session||session.role!=='buyer'||p.buyerEmail!==session.email){flash('تأكيد الاستلام متاح للعميل صاحب الأمر فقط.');return}
    if(p.status!=='بانتظار تأكيد استلام العميل'){flash('لا يمكن تأكيد الاستلام قبل أن يحدد المورد وصول التوريد للموقع.');return}
    if(usingCloud()){try{await window.SilahCloud.setOrderStatus(id,'مكتمل');await syncCloud();closeModal();flash('تم تأكيد الاستلام. يمكنك الآن تقييم المورد.');setTimeout(function(){openRating(id)},300)}catch(e){flash(cloudMessage(e))}return}
    changePoStatus(p,'مكتمل');p.receivedAt=now();closeModal();save();flash('تم تأكيد الاستلام. يمكنك الآن تقييم المورد.');setTimeout(function(){openRating(id)},300);
  }
  window.openRating=function(poId){
    var p=db.pos.find(function(x){return x.id===poId});if(!p)return;
    if(session.role==='admin'){flash('التقييم المتبادل متاح للعميل والمورد فقط.');return}
    var toRole=session.role==='buyer'?'supplier':'buyer',toEmail=toRole==='supplier'?p.supplierEmail:p.buyerEmail,old=db.ratings.find(function(r){return r.poId===poId&&r.fromEmail===session.email&&r.fromRole===session.role});
    if(old){flash('تم تسجيل تقييمك لهذا الأمر بالفعل.');return}
    openModal(modalHead('تقييم بعد التنفيذ','تقييمك يساعد على بناء سجل ثقة حقيقي داخل صِلَة.')+'<div class="form"><div class="notice"><div><b>تقييم '+esc(nameOf(toEmail,toRole))+'</b>يركز على التوريد والجودة والتواصل، وليس على السعر وحده.</div></div><div class="grid3"><label class="label">الالتزام بالتوريد<select id="rateDelivery"><option value="5">5 — ممتاز</option><option value="4">4 — جيد جدًا</option><option value="3">3 — جيد</option><option value="2">2 — ضعيف</option><option value="1">1 — ضعيف جدًا</option></select></label><label class="label">الجودة والمطابقة<select id="rateQuality"><option value="5">5 — ممتاز</option><option value="4">4 — جيد جدًا</option><option value="3">3 — جيد</option><option value="2">2 — ضعيف</option><option value="1">1 — ضعيف جدًا</option></select></label><label class="label">التواصل والاستجابة<select id="rateCommunication"><option value="5">5 — ممتاز</option><option value="4">4 — جيد جدًا</option><option value="3">3 — جيد</option><option value="2">2 — ضعيف</option><option value="1">1 — ضعيف جدًا</option></select></label></div><label class="label">تعليق مختصر<textarea id="rateComment" placeholder="اكتب ملاحظة تساعد الطرف الآخر."></textarea></label><button type="button" class="btn primary full" onclick="saveRating(&quot;'+esc(poId)+'&quot;)">حفظ التقييم</button></div>');
  }
  window.saveRating=async function(poId){
    var p=db.pos.find(function(x){return x.id===poId});if(!p)return;
    var toRole=session.role==='buyer'?'supplier':'buyer',toEmail=toRole==='supplier'?p.supplierEmail:p.buyerEmail,delivery=Number($('rateDelivery').value),quality=Number($('rateQuality').value),communication=Number($('rateCommunication').value),overall=Math.round((delivery+quality+communication)/3*10)/10;
    if(usingCloud()){var remoteTarget=profile(toEmail,toRole);if(!remoteTarget)return modalError('تعذر تحديد الحساب الذي سيتم تقييمه.');try{await window.SilahCloud.createRating({poId:poId,toId:remoteTarget.id,delivery:delivery,quality:quality,communication:communication,overall:overall,comment:$('rateComment').value.trim()});await syncCloud();closeModal();flash('شكرًا، تم حفظ التقييم.')}catch(e){return modalError(cloudMessage(e))}return}
    db.ratings.unshift({id:uid('RATE'),poId:poId,fromEmail:session.email,fromRole:session.role,toEmail:toEmail,toRole:toRole,overall:overall,delivery:delivery,quality:quality,communication:communication,comment:$('rateComment').value.trim(),createdAt:now()});
    var target=profile(toEmail,toRole);if(target){target.rating=rating(toEmail,toRole);if(toRole==='supplier')target.operational=Math.round(Math.min(100,75+target.rating*5))}
    addLog('تم تسجيل تقييم متبادل على '+p.number);closeModal();save();flash('شكرًا، تم حفظ التقييم');
  }

  window.openProfile=function(){
    var p=me(),isSupplier=p.role==='supplier',isBuyer=p.role==='buyer',d=documentData(p);
    var html=modalHead(isSupplier?'استكمال ملف المورد':'استكمال ملف الشركة','هذه البيانات تظهر للطرف الآخر بعد مراجعة الإدارة.')+'<div class="form"><div class="grid2"><label class="label">اسم الشركة <span class="required">*</span><input id="pCompany" value="'+esc(p.company||'')+'"></label><label class="label">المسؤول <span class="required">*</span><input id="pContact" value="'+esc(p.contact||'')+'"></label><label class="label">الهاتف / واتساب <span class="required">*</span><input id="pPhone" value="'+esc(p.phone||'')+'"></label><label class="label">المحافظة / المنطقة <span class="required">*</span><input id="pCity" value="'+esc(p.city||'القاهرة')+'"></label></div>';
    if(isSupplier)html+='<div class="grid2"><label class="label">الفئات التي توردها <input id="pCategories" value="'+esc((p.categories||[]).join('، '))+'" placeholder="مثال: PPR، PVC، UPVC"></label><label class="label">الماركات / المصنعون <input id="pBrands" value="'+esc(p.brands||'')+'"></label><label class="label">شروط الدفع المتاحة <input id="pTerms" value="'+esc(p.paymentTerms||'نقدي')+'"></label><label class="label">متوسط مدة التوريد (يوم)<input id="pLead" type="number" min="0" value="'+esc(p.leadTime||3)+'"></label></div>';
    if(isBuyer)html+='<div class="grid2"><label class="label">مجالات الشراء <input id="pCategories" value="'+esc((p.categories||[]).join('، '))+'" placeholder="مثال: تشطيبات، سباكة"></label><label class="label">شروط الدفع المعتادة <input id="pTerms" value="'+esc(p.paymentTerms||'نقدي')+'"></label></div>';
    html+='<div class="card"><div class="title">مستندات التحقق</div><p class="muted small">السجل التجاري والبطاقة الضريبية والمفوض بالتوقيع مطلوبة للعميل والمورد معًا. يمكن للطرف الآخر الاطلاع عليها بعد اعتماد الإدارة.</p>'+documentChips(p)+'<div class="grid2" style="margin-top:12px"><label class="label">رقم السجل التجاري <input id="pCommercialNumber" value="'+esc(d.commercialNumber||'')+'" placeholder="رقم السجل التجاري"></label><label class="label">ملف السجل التجاري <input id="pCommercialFile" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"></label><label class="label">الرقم الضريبي <input id="pTaxNumber" value="'+esc(d.taxNumber||'')+'" placeholder="الرقم الضريبي"></label><label class="label">ملف البطاقة الضريبية <input id="pTaxFile" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"></label><label class="label">اسم المفوض بالتوقيع <input id="pSignerName" value="'+esc(d.signerName||p.contact||'')+'"></label><label class="label">صفة المفوض <input id="pSignerTitle" value="'+esc(d.signerTitle||'')+'" placeholder="مثال: المدير المفوض"></label><label class="label">مستند التفويض <input id="pSignerFile" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"></label></div><div class="notice" style="margin-top:12px"><div><b>حماية بيانات المفوض</b>يظهر الاسم والصفة فقط؛ لا تُطلب أو تُعرض صورة بطاقة شخصية أو رقم هوية داخل المنصة.</div></div></div>';
    html+='<button type="button" class="btn primary full" onclick="saveProfile()">حفظ وإرسال للمراجعة</button></div>';
    openModal(html);
  }
  window.saveProfile=async function(){
    var p=me(),company=$('pCompany').value.trim(),contact=$('pContact').value.trim(),phone=$('pPhone').value.trim(),city=$('pCity').value.trim();
    if(!company||!contact||!phone||!city)return modalError('أكمل اسم الشركة والمسؤول والهاتف والمنطقة.');
    p.company=company;p.name=company;p.contact=contact;p.phone=phone;p.city=city;
    var cats=$('pCategories');if(cats)p.categories=cats.value.split(/[،,]/).map(function(x){return x.trim()}).filter(Boolean);
    var terms=$('pTerms');if(terms)p.paymentTerms=terms.value.trim();
    if(p.role==='supplier'){p.brands=$('pBrands').value.trim();p.leadTime=Number($('pLead').value||0)}
    var d=documentData(p),commercial=[],tax=[],signer=[];
    try{commercial=await persistFiles($('pCommercialFile').files||[],'verification-documents');tax=await persistFiles($('pTaxFile').files||[],'verification-documents');signer=await persistFiles($('pSignerFile').files||[],'verification-documents')}catch(e){return modalError(e.message||'تعذر حفظ مستندات التحقق.')}
    d.commercialNumber=$('pCommercialNumber').value.trim();d.taxNumber=$('pTaxNumber').value.trim();d.signerName=$('pSignerName').value.trim();d.signerTitle=$('pSignerTitle').value.trim();
    if(commercial[0])d.commercialFile=commercial[0];if(tax[0])d.taxFile=tax[0];if(signer[0])d.signerFile=signer[0];
    p.documentData=d;p.docs={commercial:!!(d.commercialNumber&&d.commercialFile),tax:!!(d.taxNumber&&d.taxFile),signer:!!(d.signerName&&d.signerTitle&&d.signerFile)};
    p.verification=complete(p)&&p.docs.commercial&&p.docs.tax&&p.docs.signer?'قيد المراجعة':complete(p)?'بيانات مكتملة — توثيق ناقص':'غير مكتمل';
    if(usingCloud()){
      try{
        await window.SilahCloud.updateMyProfile(p);
        var documentTasks=[];
        if(d.commercialFile)documentTasks.push(window.SilahCloud.saveProfileDocument('commercial',{referenceNumber:d.commercialNumber,file:d.commercialFile}));
        if(d.taxFile)documentTasks.push(window.SilahCloud.saveProfileDocument('tax',{referenceNumber:d.taxNumber,file:d.taxFile}));
        if(d.signerFile)documentTasks.push(window.SilahCloud.saveProfileDocument('signer',{signerName:d.signerName,signerTitle:d.signerTitle,file:d.signerFile}));
        await Promise.all(documentTasks);await window.SilahCloud.requestProfileReview();await syncCloud();closeModal();flash('تم حفظ الملف وإرساله للمراجعة.');
      }catch(e){return modalError(cloudMessage(e))}
      return;
    }
    addLog('تم تحديث ملف '+roleName(p.role)+' وإرساله للمراجعة.');closeModal();save();flash('تم حفظ الملف');
  }
  window.viewCompanyProfile=function(email,role){
    var p=profile(email,role);if(!p||!session){flash('تعذر فتح ملف الشركة.');return}
    var first=esc((p.company||p.email).charAt(0)),canView=session.role==='admin'||p.verification==='موثق'||(session.email===p.email&&session.role===p.role),docsView=canView?documentPanel(p):'<div class="notice"><div><b>المستندات غير متاحة بعد</b>تظهر المستندات بعد اعتماد الإدارة لحماية بيانات الشركات.</div></div>';
    openModal(modalHead('ملف '+esc(p.company||p.email),'بيانات الشركة والتوثيق لبناء الثقة بين العميل والمورد.')+'<div class="profile-hero"><div class="profile-main"><div class="avatar">'+first+'</div><div><h3>'+esc(p.company||p.email)+'</h3><p>'+esc(roleName(p.role))+' · '+esc(p.city||'—')+'</p>'+documentChips(p)+'</div></div>'+status(p.verification)+'</div><div class="meta"><span>المسؤول: '+esc(p.contact||'—')+'</span><span>هاتف: '+esc(p.phone||'—')+'</span><span>الفئات: '+esc((p.categories||[]).join('، ')||'—')+'</span><span>'+ (p.role==='supplier'?'مدة التوريد: '+esc(p.leadTime||'—')+' يوم':'شروط الدفع: '+esc(p.paymentTerms||'—')) +'</span></div><h3 style="font-size:15px;margin:16px 0 7px">ملف التوثيق</h3>'+docsView);
  }
  window.adminProfile=function(id){
    var p=db.profiles.find(function(x){return x.id===id});if(!p)return;var first=esc((p.company||p.email).charAt(0));
    openModal(modalHead('ملف '+esc(p.company||p.email),'مراجعة بيانات الحساب قبل الاعتماد.')+'<div class="profile-hero"><div class="profile-main"><div class="avatar">'+first+'</div><div><h3>'+esc(p.company||p.email)+'</h3><p>'+esc(roleName(p.role))+' · '+esc(p.email)+'</p>'+documentChips(p)+'</div></div>'+status(p.verification)+'</div><div class="meta"><span>المسؤول: '+esc(p.contact||'—')+'</span><span>هاتف: '+esc(p.phone||'—')+'</span><span>المنطقة: '+esc(p.city||'—')+'</span><span>الفئات: '+esc((p.categories||[]).join('، ')||'—')+'</span><span>الدفع: '+esc(p.paymentTerms||'—')+'</span></div><h3 style="font-size:15px;margin:16px 0 7px">مستندات التحقق</h3>'+documentPanel(p)+'<div class="actions" style="margin-top:16px">'+cmd('reviewProfile',[p.id,'موثق'],'اعتماد الحساب','primary')+cmd('reviewProfile',[p.id,'مرفوض'],'رفض','danger')+'</div>');
  }
  window.reviewProfile=async function(id,st){var p=db.profiles.find(function(x){return x.id===id});if(!p)return;if(st==='موثق'&&(!docs(p).commercial||!docs(p).tax||!docs(p).signer)){flash('لا يمكن اعتماد الحساب قبل اكتمال السجل التجاري والضريبي والمفوض بالتوقيع.');return}if(usingCloud()){try{await window.SilahCloud.reviewProfile(id,st);await syncCloud();closeModal();flash(st==='موثق'?'تم اعتماد الحساب':'تم رفض الحساب')}catch(e){flash(cloudMessage(e))}return}p.verification=st;if(st==='موثق'){if(!p.operational)p.operational=p.role==='supplier'?82:80;if(!p.financial)p.financial=p.role==='buyer'?75:80}addLog('تم '+(st==='موثق'?'اعتماد':'رفض')+' حساب '+(p.company||p.email));closeModal();save();flash(st==='موثق'?'تم اعتماد الحساب':'تم رفض الحساب')}

  window.openCredit=function(){var p=me();openModal(modalHead('طلب حد ائتماني','ترفع الإدارة الطلب للمراجعة، بينما يظل قبول الشراء الآجل قرار المورد.')+'<div class="form"><div class="grid2"><label class="label">الحد المطلوب <input id="cAmount" type="number" min="1" value="'+esc(p.creditLimit||100000)+'"></label><label class="label">أيام السداد المطلوبة <select id="cDays"><option value="15">15 يوم</option><option value="30" selected>30 يوم</option><option value="60">60 يوم</option><option value="90">90 يوم</option></select></label></div><label class="label">سبب الطلب<textarea id="cReason" placeholder="مثال: أوامر شراء لمشروع تشطيب قائم"></textarea></label><button type="button" class="btn primary full" onclick="saveCredit()">إرسال الطلب</button></div>')}
  window.saveCredit=async function(){var amount=Number($('cAmount').value||0);if(amount<=0)return modalError('أدخل حدًا ائتمانيًا صحيحًا.');var data={amount:amount,days:Number($('cDays').value),reason:$('cReason').value.trim()};if(usingCloud()){try{await window.SilahCloud.createCreditRequest(data);await syncCloud();closeModal();flash('تم إرسال طلب الائتمان')}catch(e){return modalError(cloudMessage(e))}return}db.credits.unshift({id:uid('CR'),buyerEmail:session.email,amount:amount,days:data.days,reason:data.reason,status:'قيد المراجعة',createdAt:now()});addLog('تم تقديم طلب حد ائتماني بقيمة '+smallMoney(amount));closeModal();save();flash('تم إرسال طلب الائتمان')}
  window.reviewCredit=async function(id,st){var c=db.credits.find(function(x){return x.id===id});if(!c)return;if(usingCloud()){try{await window.SilahCloud.reviewCreditRequest(id,st);await syncCloud();flash(st==='معتمد'?'تم اعتماد الحد الائتماني':'تم رفض طلب الائتمان')}catch(e){flash(cloudMessage(e))}return}c.status=st;c.reviewedAt=now();if(st==='معتمد'){var p=profile(c.buyerEmail,'buyer');if(p){p.creditLimit=Math.max(Number(p.creditLimit||0),Number(c.amount||0));p.creditRestricted=false;p.financial=Math.max(p.financial||0,75)}}addLog('تم '+(st==='معتمد'?'اعتماد':'رفض')+' طلب ائتمان '+id);save();flash(st==='معتمد'?'تم اعتماد الحد الائتماني':'تم رفض طلب الائتمان')}
  window.restrictCredit=async function(id,value){var p=db.profiles.find(function(x){return x.id===id});if(!p)return;var restricted=value==='true';if(usingCloud()){try{await window.SilahCloud.setCreditRestriction(id,restricted);await syncCloud();flash(restricted?'تم تقييد الائتمان':'تم رفع القيد الائتماني')}catch(e){flash(cloudMessage(e))}return}p.creditRestricted=restricted;addLog((p.creditRestricted?'تم تقييد':'تم رفع قيد')+' الائتمان عن '+(p.company||p.email));save();flash(p.creditRestricted?'تم تقييد الائتمان':'تم رفع القيد الائتماني')}

  window.openDispute=function(poId){var p=db.pos.find(function(x){return x.id===poId});if(!p)return;openModal(modalHead('فتح نزاع على '+esc(p.number),'يسجل النزاع بسجل واضح حتى تراجعه الإدارة وتوثق الحل.')+'<div class="form"><label class="label">سبب النزاع<select id="dReason"><option>فرق في الكمية</option><option>مشكلة جودة أو مطابقة</option><option>تأخر في التوريد</option><option>مشكلة في السعر أو الشروط</option><option>سبب آخر</option></select></label><label class="label">التفاصيل <span class="required">*</span><textarea id="dDetails" placeholder="اكتب ما حدث بوضوح دون مشاركة بيانات حساسة."></textarea></label><button type="button" class="btn danger full" onclick="saveDispute(&quot;'+esc(poId)+'&quot;)">تسجيل النزاع</button></div>')}
  window.saveDispute=async function(poId){var details=$('dDetails').value.trim();if(!details)return modalError('اكتب تفاصيل النزاع.');var data={number:'DSP-'+String(db.disputes.length+1).padStart(4,'0'),poId:poId,reason:$('dReason').value,details:details};if(usingCloud()){try{data.number=await window.SilahCloud.nextNumber('dispute');await window.SilahCloud.createDispute(data);await syncCloud();closeModal();flash('تم تسجيل النزاع وبانتظار مراجعة الإدارة')}catch(e){return modalError(cloudMessage(e))}return}db.disputes.unshift({id:uid('DSP'),number:data.number,poId:poId,openedByEmail:session.email,openedByRole:session.role,reason:data.reason,details:details,status:'مفتوح',createdAt:now()});addLog('تم فتح نزاع على أمر التوريد '+poId);closeModal();save();flash('تم تسجيل النزاع وبانتظار مراجعة الإدارة')}
  window.disputeDetails=function(id){var d=db.disputes.find(function(x){return x.id===id});if(!d)return;var p=db.pos.find(function(x){return x.id===d.poId});openModal(modalHead(esc(d.number||d.id),'تفاصيل النزاع وسجل المراجعة.')+'<div class="meta"><span>الأمر: '+esc(p?p.number:'—')+'</span><span>فتح بواسطة: '+esc(nameOf(d.openedByEmail,d.openedByRole))+'</span><span>التاريخ: '+time(d.createdAt)+'</span><span>الحالة: '+esc(d.status)+'</span></div><h3 style="font-size:15px">السبب: '+esc(d.reason)+'</h3><p class="muted">'+esc(d.details)+'</p>'+(session.role==='admin'&&d.status==='مفتوح'?cmd('solveDispute',[d.id,'تم الحل'],'إغلاق بعد الحل','primary'):''))}
  window.solveDispute=async function(id,st){var d=db.disputes.find(function(x){return x.id===id});if(!d)return;if(usingCloud()){try{await window.SilahCloud.resolveDispute(id,st);await syncCloud();closeModal();flash('تم تحديث حالة النزاع')}catch(e){flash(cloudMessage(e))}return}d.status=st;d.resolvedAt=now();addLog('تم إغلاق النزاع '+(d.number||d.id));closeModal();save();flash('تم تحديث حالة النزاع')}

  window.downloadBackup=function(){var b=new Blob([JSON.stringify(db,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='silah-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},500);flash('تم تنزيل النسخة الاحتياطية')}
  window.triggerImport=function(){if(usingCloud()){flash('استرجاع الملف اليدوي متاح في النسخة المحلية فقط؛ بياناتك السحابية محمية من الاستبدال غير المقصود.');return}$('importFile').click()}
  $('importFile').addEventListener('change',function(){var f=this.files&&this.files[0];if(!f)return;if(usingCloud()){this.value='';return}var rd=new FileReader();rd.onload=function(){try{var x=normalize(JSON.parse(rd.result));if(!x.version)throw new Error('bad');db=x;save();flash('تم استرجاع البيانات بنجاح')}catch(e){flash('ملف النسخة الاحتياطية غير صالح')}};rd.readAsText(f);this.value=''});
  window.addEventListener('storage',function(e){if(e.key===DB_KEY){db=loadDB();if(session)render();}});

  setAuthMode('login');
  render();
  restoreCloudSession();
})();
