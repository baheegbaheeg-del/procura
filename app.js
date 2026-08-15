(function(){
  'use strict';
  var DB_KEY='silah_final_v2_db';
  var SESSION_KEY='silah_final_v2_session';
  var db=loadDB();
  var session=loadSession();
  var active='dashboard';
  var toastTimer;

  function $(id){return document.getElementById(id)}
  function baseDB(){return {version:2,profiles:[],rfqs:[],quotes:[],pos:[],ratings:[],credits:[],disputes:[],activity:[],counters:{rfq:0,quote:0,po:0}}}
  function normalize(x){
    var b=baseDB();
    if(!x||typeof x!=='object')return b;
    Object.keys(b).forEach(function(k){if(x[k]!==undefined)b[k]=x[k]});
    ['profiles','rfqs','quotes','pos','ratings','credits','disputes','activity'].forEach(function(k){if(!Array.isArray(b[k]))b[k]=[]});
    if(!b.counters||typeof b.counters!=='object')b.counters={rfq:b.rfqs.length,quote:b.quotes.length,po:b.pos.length};
    ['rfq','quote','po'].forEach(function(k){if(typeof b.counters[k]!=='number')b.counters[k]=0});
    b.version=2;
    return b;
  }
  function loadDB(){try{return normalize(JSON.parse(localStorage.getItem(DB_KEY)))}catch(e){return baseDB()}}
  function loadSession(){try{var x=JSON.parse(localStorage.getItem(SESSION_KEY));return x&&x.email&&x.role?x:null}catch(e){return null}}
  function save(){localStorage.setItem(DB_KEY,JSON.stringify(db));render()}
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
  function complete(p){return !!(p&&(p.role==='admin'||p.company&&p.contact&&p.phone&&p.city))}
  function total(q){return Number(q.itemsTotal||0)-Number(q.discount||0)+Number(q.shipping||0)+Number(q.tax||0)+Number(q.other||0)}
  function qItem(q,itemId){return (q.items||[]).find(function(i){return i.itemId===itemId})}
  function valid(q,itemId){var i=qItem(q,itemId);return i&&Number(i.unitPrice)>0&&i.availability!=='غير متوفر'}
  function sumItems(items){return items.reduce(function(n,i){return n+Number(i.subtotal||0)},0)}
  function allocated(q,items){var part=sumItems(items),all=Number(q.itemsTotal||0),r=all?part/all:1;return Math.round((part-Number(q.discount||0)*r+Number(q.shipping||0)*r+Number(q.tax||0)*r+Number(q.other||0)*r)*100)/100}
  function avg(a){return a.length?a.reduce(function(s,n){return s+Number(n||0)},0)/a.length:0}
  function rating(email,role){var a=db.ratings.filter(function(r){return r.toEmail===email&&r.toRole===role});return a.length?Math.round(avg(a.map(function(r){return r.overall}))*10)/10:0}
  function outstanding(email){return db.pos.filter(function(p){return p.buyerEmail===email&&['بانتظار تأكيد المورد','قيد التجهيز','خرج للتوريد','تم التسليم'].indexOf(p.status)>-1}).reduce(function(s,p){return s+Number(p.total||0)},0)}
  function next(type){db.counters[type]=(db.counters[type]||0)+1;return String(db.counters[type]).padStart(5,'0')}
  function addLog(text){db.activity.unshift({id:uid('ACT'),text:text,actor:session?session.email:'system',createdAt:now()})}
  function tone(s){s=String(s||'');if(/موثق|معتمد|تم التسليم|مستلم|فاز|تم الحل/.test(s))return 'success';if(/مرفوض|ملغي|مقيد/.test(s))return 'danger';if(/بانتظار|مفتوح|قيد|خرج|مراجعة|معلق/.test(s))return 'warn';if(/مُرسل|مرسل|جديد/.test(s))return 'info';return 'neutral'}
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

  function demoData(){
    var d=baseDB(),t=Date.now();
    d.profiles=[
      {id:'PB1',email:'buyer@silah.demo',role:'buyer',name:'شركة النور للتشطيبات',company:'شركة النور للتشطيبات',contact:'أحمد سمير',phone:'01000000001',city:'القاهرة الجديدة',categories:['سباكة ومواسير PPR','تشطيبات'],brands:'',paymentTerms:'أجل 30 يوم',leadTime:0,creditLimit:350000,creditRestricted:false,verification:'موثق',docs:{commercial:true,tax:true,signer:true},rating:4.7,financial:89,operational:93,founder:true,createdAt:new Date(t-30*86400000).toISOString()},
      {id:'PS1',email:'supplier@silah.demo',role:'supplier',name:'المستقبل للتوريدات',company:'المستقبل للتوريدات',contact:'محمود عادل',phone:'01000000002',city:'مدينة نصر',categories:['PPR','PVC','UPVC','وصلات سباكة'],brands:'Aqua / Master / Union',paymentTerms:'نقدي / أجل 30 يوم للعملاء المعتمدين',leadTime:3,verification:'موثق',docs:{commercial:true,tax:true,signer:true},rating:4.8,financial:91,operational:96,founder:true,createdAt:new Date(t-27*86400000).toISOString()},
      {id:'PS2',email:'supply@silah.demo',role:'supplier',name:'الرواد لمواد البناء',company:'الرواد لمواد البناء',contact:'عمر نبيل',phone:'01000000003',city:'مصر الجديدة',categories:['PPR','أدوات صحية'],brands:'ProLine / Nova',paymentTerms:'نقدي / أجل 15 يوم',leadTime:4,verification:'موثق',docs:{commercial:true,tax:true,signer:true},rating:4.5,financial:86,operational:90,founder:true,createdAt:new Date(t-24*86400000).toISOString()},
      {id:'PS3',email:'pending@silah.demo',role:'supplier',name:'شركة بداية للتوريد',company:'شركة بداية للتوريد',contact:'سارة حسن',phone:'01000000004',city:'القاهرة',categories:['PVC'],brands:'',paymentTerms:'نقدي',leadTime:5,verification:'قيد المراجعة',docs:{commercial:true,tax:true,signer:false},rating:0,financial:0,operational:0,founder:true,createdAt:new Date(t-2*86400000).toISOString()},
      {id:'PA1',email:'admin@silah.demo',role:'admin',name:'إدارة صِلَة',company:'إدارة صِلَة',contact:'مدير العمليات',phone:'',city:'القاهرة',categories:[],brands:'',paymentTerms:'',leadTime:0,verification:'موثق',docs:{commercial:true,tax:true,signer:true},rating:0,financial:0,operational:0,founder:false,createdAt:new Date(t-60*86400000).toISOString()}
    ];
    var r1={id:'R1',number:'RFQ-00001',buyerEmail:'buyer@silah.demo',company:'شركة النور للتشطيبات',project:'تشطيب فيلا — التجمع الخامس',category:'سباكة ومواسير PPR',type:'طلب حقيقي',location:'التجمع الخامس — القاهرة الجديدة',deadline:new Date(t+5*86400000).toISOString().slice(0,10),payment:'أجل 30 يوم',notes:'يرجى تقديم الماركة وبلد المنشأ والضمان. التوريد على دفعتين.',attachments:[{name:'BOQ-فيلا-التجمع.xlsx',size:183400},{name:'مواصفات-فنية.pdf',size:296200}],status:'مفتوح لاستقبال العروض',createdAt:new Date(t-86400000).toISOString(),items:[{id:'I101',name:'مواسير PPR 20 مم',qty:300,unit:'متر',spec:'ضغط 20 بار'},{id:'I102',name:'مواسير PPR 25 مم',qty:200,unit:'متر',spec:'ضغط 20 بار'},{id:'I103',name:'كوع PPR 20 مم',qty:100,unit:'قطعة',spec:'مساوٍ'}]};
    var r2={id:'R2',number:'RFQ-00002',buyerEmail:'buyer@silah.demo',company:'شركة النور للتشطيبات',project:'مشروع إداري — مصر الجديدة',category:'سباكة ومواسير PPR',type:'طلب تجريبي',location:'مصر الجديدة',deadline:new Date(t-9*86400000).toISOString().slice(0,10),payment:'نقدي',notes:'طلب عرض تجريبي لشرح المنصة.',attachments:[],status:'تم إصدار أوامر شراء',createdAt:new Date(t-12*86400000).toISOString(),items:[{id:'I201',name:'محبس كرة 1 بوصة',qty:20,unit:'قطعة',spec:'نحاس'},{id:'I202',name:'وصلة PPR 25 مم',qty:60,unit:'قطعة',spec:'حراري'}]};
    d.rfqs=[r1,r2];
    d.quotes=[
      {id:'Q1',number:'Q-00001',rfqId:'R1',supplierEmail:'supplier@silah.demo',supplier:'المستقبل للتوريدات',items:[{itemId:'I101',name:'مواسير PPR 20 مم',qty:300,unit:'متر',unitPrice:42,subtotal:12600,availability:'متوفر',brand:'Aqua',origin:'مصر',warranty:'ضمان المصنع'},{itemId:'I102',name:'مواسير PPR 25 مم',qty:200,unit:'متر',unitPrice:61,subtotal:12200,availability:'متوفر',brand:'Aqua',origin:'مصر',warranty:'ضمان المصنع'},{itemId:'I103',name:'كوع PPR 20 مم',qty:100,unit:'قطعة',unitPrice:12,subtotal:1200,availability:'متوفر',brand:'Aqua',origin:'مصر',warranty:'ضمان المصنع'}],itemsTotal:26000,discount:900,shipping:650,tax:0,other:0,deliveryDays:3,validity:7,payment:'أجل 30 يوم للعميل المعتمد',notes:'متاح التوريد على دفعتين.',status:'مُرسل',createdAt:new Date(t-18*3600000).toISOString()},
      {id:'Q2',number:'Q-00002',rfqId:'R1',supplierEmail:'supply@silah.demo',supplier:'الرواد لمواد البناء',items:[{itemId:'I101',name:'مواسير PPR 20 مم',qty:300,unit:'متر',unitPrice:40,subtotal:12000,availability:'متوفر',brand:'ProLine',origin:'مصر',warranty:'ضمان المصنع'},{itemId:'I102',name:'مواسير PPR 25 مم',qty:200,unit:'متر',unitPrice:64,subtotal:12800,availability:'متوفر جزئيًا',brand:'ProLine',origin:'مصر',warranty:'ضمان المصنع'},{itemId:'I103',name:'كوع PPR 20 مم',qty:100,unit:'قطعة',unitPrice:11,subtotal:1100,availability:'متوفر',brand:'ProLine',origin:'مصر',warranty:'ضمان المصنع'}],itemsTotal:25900,discount:300,shipping:400,tax:0,other:0,deliveryDays:4,validity:5,payment:'نقدي / أجل 15 يوم',notes:'يشمل النقل حتى الموقع.',status:'مُرسل',createdAt:new Date(t-13*3600000).toISOString()},
      {id:'Q3',number:'Q-00003',rfqId:'R2',supplierEmail:'supplier@silah.demo',supplier:'المستقبل للتوريدات',items:[{itemId:'I201',name:'محبس كرة 1 بوصة',qty:20,unit:'قطعة',unitPrice:180,subtotal:3600,availability:'متوفر',brand:'Union',origin:'مصر',warranty:'ضمان المصنع'},{itemId:'I202',name:'وصلة PPR 25 مم',qty:60,unit:'قطعة',unitPrice:15,subtotal:900,availability:'متوفر',brand:'Aqua',origin:'مصر',warranty:'ضمان المصنع'}],itemsTotal:4500,discount:100,shipping:100,tax:0,other:0,deliveryDays:2,validity:7,payment:'نقدي',notes:'تم اختيار العرض.',status:'فاز كليًا',createdAt:new Date(t-10*86400000).toISOString()}
    ];
    d.pos=[{id:'P1',number:'PO-00001',rfqId:'R2',rfqNumber:'RFQ-00002',buyerEmail:'buyer@silah.demo',supplierEmail:'supplier@silah.demo',buyer:'شركة النور للتشطيبات',supplier:'المستقبل للتوريدات',project:'مشروع إداري — مصر الجديدة',items:[{itemId:'I201',name:'محبس كرة 1 بوصة',qty:20,unit:'قطعة',unitPrice:180,subtotal:3600},{itemId:'I202',name:'وصلة PPR 25 مم',qty:60,unit:'قطعة',unitPrice:15,subtotal:900}],total:4500,payment:'نقدي',deliveryDays:2,status:'قيد التجهيز',createdAt:new Date(t-8*86400000).toISOString(),notes:'توريد صباح الأحد'}];
    d.ratings=[{id:'RT1',poId:'old',fromEmail:'buyer@silah.demo',fromRole:'buyer',toEmail:'supplier@silah.demo',toRole:'supplier',overall:4.7,delivery:5,quality:5,communication:4,comment:'استجابة سريعة وتوريد مطابق.',createdAt:new Date(t-18*86400000).toISOString()}];
    d.credits=[{id:'CR1',buyerEmail:'buyer@silah.demo',amount:350000,days:30,reason:'حد شراء مبدئي لمشروعات التشطيب',status:'معتمد',createdAt:new Date(t-25*86400000).toISOString()}];
    d.activity=[{id:'A1',text:'تم اعتماد المورد المستقبل للتوريدات كمورد موثق.',actor:'admin@silah.demo',createdAt:new Date(t-27*86400000).toISOString()},{id:'A2',text:'تم نشر RFQ-00001 لاستقبال عروض الموردين.',actor:'buyer@silah.demo',createdAt:new Date(t-86400000).toISOString()},{id:'A3',text:'وصل عرضان تفصيليان على RFQ-00001.',actor:'system',createdAt:new Date(t-12*3600000).toISOString()}];
    d.counters={rfq:2,quote:3,po:1};
    return d;
  }

  function tabs(role){if(role==='buyer')return [['dashboard','لوحة العميل'],['rfqs','طلبات الشراء'],['quotes','العروض والمقارنة'],['orders','أوامر الشراء'],['credit','الائتمان والثقة'],['profile','ملف الشركة'],['ratings','التقييمات'],['activity','سجل النشاط']];if(role==='supplier')return [['dashboard','فرص التوريد'],['rfqs','طلبات متاحة'],['quotes','عروضي'],['orders','أوامر التوريد'],['profile','ملف المورد'],['ratings','التقييمات'],['activity','سجل النشاط']];return [['dashboard','مركز القيادة'],['profiles','التحقق والحسابات'],['rfqs','طلبات الشراء'],['quotes','العروض'],['orders','الأوامر والتوريد'],['credit','الائتمان والمخاطر'],['disputes','النزاعات'],['ratings','جودة الشبكة'],['activity','سجل العمليات'],['settings','سياسة الإطلاق']]}
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
    $('sessionBadge').textContent=(session.role==='buyer'?'▣ ':session.role==='supplier'?'↗ ':'◈ ')+roleName(session.role);
    $('appTitle').textContent=session.role==='buyer'?'مرحبًا، '+(p.company||p.name||'قسم المشتريات'):session.role==='supplier'?'مرحبًا، '+(p.company||p.name||'مورد صِلَة'):'مرحبًا، إدارة صِلَة';
    $('appSubtitle').textContent=session.role==='buyer'?'من طلب الشراء إلى استلام التوريد في مكان واحد.':session.role==='supplier'?'قدّم عرضك بوضوح وتابع كل أمر توريد بثقة.':'راقب الشبكة التشغيلية واعتمد الحسابات والائتمان.';
    var ta=$('topAction');
    if(session.role==='buyer'){ta.textContent='طلب شراء جديد';ta.className='btn primary';ta.onclick=openRequest}
    else if(session.role==='supplier'){ta.textContent='أكمل ملف المورد';ta.className='btn primary';ta.onclick=openProfile}
    else{ta.textContent='مراجعة الحسابات';ta.className='btn navy';ta.onclick=function(){setTab('profiles')}}
    var on=$('onboarding');
    if(!complete(p)&&session.role!=='admin'){on.classList.remove('hidden');on.innerHTML='<div><b>خطوة مهمة قبل بدء التعامل</b>أكمل بيانات الشركة والمستندات لتُرسل للمراجعة وتظهر بصورة موثوقة للطرف الآخر.</div><button type="button" class="btn primary tiny" onclick="openProfile()">إكمال الملف</button>'}
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
    if(session.role==='buyer'){var p=me(),used=outstanding(session.email),free=Math.max(0,Number(p.creditLimit||0)-used);h=stat('طلبات الشراء',rr.length,'المفتوح: '+rr.filter(function(r){return r.status==='مفتوح لاستقبال العروض'}).length,'rfqs')+stat('العروض المستلمة',qq.length,'جاهزة للمقارنة','quotes')+stat('أوامر الشراء',pp.length,'قيد المتابعة: '+pp.filter(function(p){return p.status!=='مستلم من العميل'}).length,'orders')+stat('ائتمان متاح',smallMoney(free),'الحد: '+smallMoney(p.creditLimit||0),'credit')}
    else if(session.role==='supplier'){h=stat('طلبات متاحة',rr.filter(function(r){return r.status==='مفتوح لاستقبال العروض'}).length,'في فئات التوريد','rfqs')+stat('عروضي',qq.length,'العروض المرسلة','quotes')+stat('أوامر توريد',pp.length,'تحتاج متابعة: '+pp.filter(function(p){return p.status!=='مستلم من العميل'}).length,'orders')+stat('تقييم المورد',rating(session.email,'supplier')||'جديد','تشغيل: '+(me().operational||'—'),'ratings')}
    else{var pending=db.profiles.filter(function(p){return p.role!=='admin'&&p.verification==='قيد المراجعة'}).length;h=stat('حسابات قيد المراجعة',pending,'تحقق وتوثيق','profiles')+stat('طلبات مفتوحة',rr.filter(function(r){return r.status==='مفتوح لاستقبال العروض'}).length,'طلبات عروض سعر','rfqs')+stat('أوامر نشطة',pp.filter(function(p){return p.status!=='مستلم من العميل'}).length,'متابعة التوريد','orders')+stat('قيمة أوامر ممررة',smallMoney(pp.reduce(function(s,p){return s+Number(p.total||0)},0)),'ليست إيراد صِلَة','credit')}
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
    return '<article class="card"><div class="card-row"><div><div class="title">'+esc(q.supplier)+'</div><div class="small muted">'+esc(r?r.number+' — '+r.project:'طلب غير متاح')+'</div></div><div>'+status(q.status||'مُرسل')+' <span class="badge orange">★ '+(rating(q.supplierEmail,'supplier')||pFor(q.supplierEmail,'supplier').rating||'جديد')+'</span></div></div><div class="meta"><span>الإجمالي: <b>'+money(total(q))+'</b></span><span>تسليم: '+esc(q.deliveryDays)+' يوم</span><span>الدفع: '+esc(q.payment||'غير محدد')+'</span><span>صلاحية: '+esc(q.validity)+' أيام</span></div><p class="muted small">'+esc(q.notes||'عرض تفصيلي لكل بند.')+'</p><div class="actions">'+a+'</div></article>';
  }
  function poCard(p){
    var sup=session.role==='supplier'&&p.supplierEmail===session.email,buy=session.role==='buyer'&&p.buyerEmail===session.email,a=cmd('poDetails',p.id,'تفاصيل الأمر');
    if(sup&&p.status==='بانتظار تأكيد المورد')a+=cmd('advancePo',[p.id,'قيد التجهيز'],'تأكيد وتجهيز','primary');
    if(sup&&p.status==='قيد التجهيز')a+=cmd('advancePo',[p.id,'خرج للتوريد'],'خرج للتوريد','primary');
    if(sup&&p.status==='خرج للتوريد')a+=cmd('advancePo',[p.id,'تم التسليم'],'تم التسليم للموقع','primary');
    if(buy&&p.status==='تم التسليم')a+=cmd('receivePo',p.id,'تأكيد الاستلام','primary');
    if((sup||buy)&&p.status!=='مستلم من العميل')a+=cmd('openDispute',p.id,'فتح نزاع','warn');
    if((sup||buy)&&p.status==='مستلم من العميل')a+=cmd('openRating',p.id,'إضافة تقييم','soft');
    return '<article class="card"><div class="card-row"><div><div class="title">'+esc(p.number)+'</div><div class="small muted">'+esc(p.project)+'</div></div>'+status(p.status)+'</div><div class="meta"><span>المورد: '+esc(p.supplier)+'</span><span>العميل: '+esc(p.buyer||nameOf(p.buyerEmail,'buyer'))+'</span><span>الإجمالي: <b>'+money(p.total)+'</b></span><span>الدفع: '+esc(p.payment||'—')+'</span><span>البنود: '+(p.items||[]).length+'</span></div><div class="actions">'+a+'</div></article>';
  }
  function buyerView(){
    var rr=db.rfqs.filter(function(r){return r.buyerEmail===session.email}),qq=db.quotes.filter(function(q){var r=db.rfqs.find(function(x){return x.id===q.rfqId});return r&&r.buyerEmail===session.email}),pp=db.pos.filter(function(p){return p.buyerEmail===session.email});
    if(active==='dashboard')return panel('ملخص المشتريات','ابدأ طلبًا جديدًا أو تابع ما وصل من الموردين.','<button type="button" class="btn primary" onclick="openRequest()">طلب شراء جديد</button>','<div class="dashboard-grid"><div>'+cards(rr.slice(0,3).map(rfqCard))+'</div><div class="warning"><h3>كيف تعمل صِلَة؟</h3><p>تنشر طلبك، الموردون يقدمون عروضًا تفصيلية، ثم تختار موردًا واحدًا أو تقسم البنود بين أكثر من مورد. دفع البضاعة وفاتورتها بينك وبين المورد مباشرة.</p><div class="actions" style="margin-top:12px"><button type="button" class="btn navy tiny" onclick="setTab(&quot;quotes&quot;)">عرض العروض</button><button type="button" class="btn ghost tiny" onclick="setTab(&quot;credit&quot;)">الائتمان والثقة</button></div></div></div>');
    if(active==='rfqs')return panel('طلبات الشراء','أضف البنود والمواصفات والمرفقات ثم انشرها للموردين.','<button type="button" class="btn primary" onclick="openRequest()">طلب شراء جديد</button>',cards(rr.map(rfqCard)));
    if(active==='quotes'){var groups=rr.map(function(r){var a=qq.filter(function(q){return q.rfqId===r.id});if(!a.length)return '<article class="card"><div class="card-row"><div><div class="title">'+esc(r.number)+' — '+esc(r.project)+'</div><p class="muted small">لم يصل أي عرض بعد.</p></div>'+status(r.status)+'</div>'+cmd('requestDetails',r.id,'تفاصيل')+'</article>';var min=Math.min.apply(null,a.map(total));return '<article class="card"><div class="card-row"><div><div class="title">'+esc(r.number)+' — '+esc(r.project)+'</div><p class="muted small">'+a.length+' عروض مستلمة · أقل إجمالي '+money(min)+'</p></div>'+status(r.status)+'</div><div class="meta"><span>البنود: '+r.items.length+'</span><span>الدفع: '+esc(r.payment)+'</span><span>المكان: '+esc(r.location)+'</span></div><div class="actions">'+cmd('compare',r.id,'افتح المقارنة الذكية','navy')+cmd('requestDetails',r.id,'تفاصيل')+'</div></article>'});return panel('العروض والمقارنة','قارن عروض الموردين بندًا ببند ثم أصدر أوامر شراء لمورد واحد أو أكثر.','',cards(groups))}
    if(active==='orders')return panel('أوامر الشراء','تابع تأكيد المورد والتجهيز والتوريد ثم أكد الاستلام.','',cards(pp.map(poCard)));
    if(active==='credit')return buyerCredit();
    if(active==='profile')return profileView();
    if(active==='ratings')return ratingsView();
    return activityView('سجل نشاط العميل');
  }
  function supplierView(){
    var open=db.rfqs.filter(function(r){return r.status==='مفتوح لاستقبال العروض'}),qq=db.quotes.filter(function(q){return q.supplierEmail===session.email}),pp=db.pos.filter(function(p){return p.supplierEmail===session.email});
    if(active==='dashboard')return panel('فرص التوريد','طلبات مفتوحة في شبكة صِلَة، مع متابعة عروضك وأوامرك.','', '<div class="dashboard-grid"><div>'+cards(open.slice(0,3).map(rfqCard))+'</div><div class="warning"><h3>برنامج المورد المؤسس</h3><p>التسجيل وتجهيز الحساب مجانًا. أول 3 مبيعات ناجحة بلا رسوم، وبعدها تظهر رسوم النجاح بوضوح قبل تقديم العرض. العميل يسدد لك مباشرة.</p><div class="actions" style="margin-top:12px"><button type="button" class="btn primary tiny" onclick="openProfile()">إكمال ملف المورد</button><button type="button" class="btn ghost tiny" onclick="setTab(&quot;rfqs&quot;)">استعراض الطلبات</button></div></div></div>');
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

  window.showLanding=function(){session=null;localStorage.removeItem(SESSION_KEY);render()}
  window.openAuth=function(role){$('landingView').classList.add('hidden');$('appView').classList.add('hidden');$('authView').classList.remove('hidden');$('role').value=role||'supplier';roleNote();window.scrollTo({top:0,behavior:'smooth'})}
  window.roleNote=function(){var r=$('role').value;$('roleNote').innerHTML=r==='buyer'?'<div><b>بوابة العميل</b>أنشئ طلب شراء واستقبل عروضًا ثم قارنها وأصدر أمر الشراء.</div>':r==='supplier'?'<div><b>بوابة المورد المؤسس</b>جهّز ملف شركتك مجانًا، ثم استقبل الطلبات وقدّم عروضًا تفصيلية.</div>':'<div><b>لوحة إدارة صِلَة</b>تابع التوثيق والطلبات والعروض والأوامر والائتمان.</div>'}
  $('loginForm').addEventListener('submit',function(e){e.preventDefault();var email=$('email').value.trim().toLowerCase(),pass=$('password').value,role=$('role').value;if(!email||pass.length<4)return;var p=profile(email,role);if(!p){p={id:uid('PR'),email:email,role:role,name:email.split('@')[0],company:'',contact:'',phone:'',city:'القاهرة',categories:[],brands:'',paymentTerms:'نقدي',leadTime:3,creditLimit:role==='buyer'?0:null,creditRestricted:false,verification:'غير مكتمل',docs:{commercial:false,tax:false,signer:false},rating:0,financial:0,operational:0,founder:role==='supplier',createdAt:now()};db.profiles.push(p);addLog('تم إنشاء حساب '+roleName(role)+' جديد')}session={email:email,role:role};localStorage.setItem(SESSION_KEY,JSON.stringify(session));active=complete(p)?'dashboard':'profile';save();if(!complete(p))flash('أكمل ملف الشركة أولًا ليظهر حسابك بصورة احترافية')});
  window.useDemo=function(role){db=demoData();localStorage.setItem(DB_KEY,JSON.stringify(db));session={email:role==='buyer'?'buyer@silah.demo':role==='supplier'?'supplier@silah.demo':'admin@silah.demo',role:role};localStorage.setItem(SESSION_KEY,JSON.stringify(session));active='dashboard';render();flash('تم فتح الحساب التجريبي')}
  window.seedDemo=function(confirmIt){if(confirmIt&&db.rfqs.length&&!confirm('سيتم استبدال بيانات العرض الحالية بالبيانات التجريبية. هل تريد المتابعة؟'))return;db=demoData();localStorage.setItem(DB_KEY,JSON.stringify(db));if(session)render();else openAuth('supplier');flash('تم تحميل بيانات العرض التجريبي')}
  window.logout=function(){session=null;localStorage.removeItem(SESSION_KEY);render()}
  window.setTab=function(tab){active=tab;renderApp();window.scrollTo({top:0,behavior:'smooth'})}
  window.closeModal=closeModal;

  function buyerCredit(){
    var p=me(),used=outstanding(session.email),free=Math.max(0,Number(p.creditLimit||0)-used),pending=db.credits.find(function(c){return c.buyerEmail===session.email&&c.status==='قيد المراجعة'});
    var body='<div class="score-grid"><div class="score"><span>الحد الائتماني</span><b>'+smallMoney(p.creditLimit||0)+'</b></div><div class="score"><span>مستخدم في أوامر نشطة</span><b>'+smallMoney(used)+'</b></div><div class="score"><span>المتاح حاليًا</span><b>'+smallMoney(free)+'</b></div></div><div class="cards" style="margin-top:13px"><div class="card"><div class="title">الموثوقية المالية</div><b class="money" style="font-size:26px">'+(p.financial||'جديد')+(p.financial?' / 100':'')+'</b><p class="muted small">يعتمد القرار النهائي على موافقة المورد وشروطه، وليس على صِلَة وحدها.</p></div><div class="card"><div class="title">حالة الائتمان</div>'+status(p.creditRestricted?'مقيد':'نشط')+'<p class="muted small">'+(p.creditRestricted?'تم تقييد الحساب الائتماني لحين مراجعة الإدارة.':'يمكن للمورد تحديد الشروط والحد الائتماني المناسبين لكل عميل.')+'</p></div></div>';
    return panel('الائتمان والثقة','الشراء الآجل قرار تجاري بين المورد والعميل مع سجل واضح داخل صِلَة.',pending?'<span class="badge orange">طلبك قيد المراجعة</span>':'<button type="button" class="btn primary" onclick="openCredit()">طلب حد ائتماني</button>',body);
  }
  function profileView(){
    var p=me(),d=docs(p),r=rating(p.email,p.role)||p.rating||0,docsHtml='';
    if(p.role==='supplier')docsHtml='<div class="docs"><span class="doc '+(d.commercial?'ok':'')+'">السجل التجاري '+(d.commercial?'✓':'—')+'</span><span class="doc '+(d.tax?'ok':'')+'">البطاقة الضريبية '+(d.tax?'✓':'—')+'</span><span class="doc '+(d.signer?'ok':'')+'">المفوض بالتوقيع '+(d.signer?'✓':'—')+'</span></div>';
    var first=esc((p.company||p.name||p.email||'ص').charAt(0));
    var body='<div class="profile-hero"><div class="profile-main"><div class="avatar">'+first+'</div><div><h3>'+esc(p.company||p.name||'أكمل بيانات شركتك')+'</h3><p>'+esc(p.email)+' · '+esc(p.city||'')+'</p>'+docsHtml+'</div></div>'+status(p.verification||'غير مكتمل')+'</div><div class="score-grid"><div class="score"><span>تقييم الشبكة</span><b>'+ (r||'جديد') +(r?' / 5':'')+'</b></div><div class="score"><span>الثقة التشغيلية</span><b>'+ (p.operational||'جديد') +(p.operational?' / 100':'')+'</b></div><div class="score"><span>الثقة المالية</span><b>'+ (p.financial||'جديد') +(p.financial?' / 100':'')+'</b></div></div><div class="cards" style="margin-top:13px"><div class="card"><div class="title">بيانات التواصل</div><div class="meta"><span>المسؤول: '+esc(p.contact||'غير مكتمل')+'</span><span>هاتف / واتساب: '+esc(p.phone||'غير مكتمل')+'</span><span>المحافظة: '+esc(p.city||'غير مكتمل')+'</span></div></div><div class="card"><div class="title">'+(p.role==='supplier'?'قدرات التوريد':'بيانات الشراء')+'</div><div class="meta"><span>الفئات: '+esc((p.categories||[]).join('، ')||'غير محددة')+'</span><span>'+ (p.role==='supplier'?'الماركات: '+esc(p.brands||'غير محددة'):'شروط الدفع: '+esc(p.paymentTerms||'غير محددة')) +'</span><span>'+ (p.role==='supplier'?'مدة التوريد: '+esc(p.leadTime||'—')+' يوم':'حد الائتمان: '+smallMoney(p.creditLimit||0))+'</span></div></div></div>';
    return panel(p.role==='supplier'?'ملف المورد والتوثيق':'ملف الشركة والثقة','تظهر هذه البيانات للطرف الآخر بعد اعتمادها من الإدارة.','<button type="button" class="btn primary" onclick="openProfile()">تعديل الملف</button>',body);
  }
  function ratingsView(){
    var a=db.ratings.filter(function(r){return r.toEmail===session.email&&r.toRole===session.role});
    var rows=a.map(function(r){return '<article class="card"><div class="card-row"><div><div class="title">'+esc(nameOf(r.fromEmail,r.fromRole))+'</div><div class="small muted">'+date(r.createdAt)+'</div></div><span class="badge orange">★ '+esc(r.overall)+' / 5</span></div><div class="meta"><span>التوريد: '+esc(r.delivery)+'</span><span>الجودة: '+esc(r.quality)+'</span><span>التواصل: '+esc(r.communication)+'</span></div><p class="muted small">'+esc(r.comment||'—')+'</p></article>'});
    return panel('التقييمات والثقة','التقييم المتبادل يظهر بعد استلام العميل ويغذي مؤشر الثقة التشغيلية.','',rows.length?cards(rows):empty('لا توجد تقييمات مستلمة بعد','بعد إتمام أمر توريد يمكن للطرفين إضافة تقييم متبادل.'));
  }
  function activityView(title){
    var a=db.activity.slice(0,25).map(function(x){return '<div class="time"><i></i><div><b>'+esc(x.text)+'</b><small>'+time(x.createdAt)+' · '+esc(x.actor||'النظام')+'</small></div></div>'});
    return panel(title,'سجل واضح لكل خطوة تشغيلية داخل النسخة التجريبية.','',a.length?'<div class="timeline">'+a.join('')+'</div>':empty('لا توجد عمليات بعد','ستظهر الأنشطة هنا عند استخدام النظام.'));
  }
  function adminProfiles(){
    var rows=db.profiles.filter(function(p){return p.role!=='admin'}).map(function(p){var d=docs(p),buttons=(p.verification!=='موثق'?cmd('reviewProfile',[p.id,'موثق'],'اعتماد','primary'):'')+cmd('reviewProfile',[p.id,'مرفوض'],'رفض','danger')+cmd('adminProfile',p.id,'عرض الملف');return '<article class="card"><div class="card-row"><div><div class="title">'+esc(p.company||p.name||p.email)+'</div><div class="small muted">'+roleName(p.role)+' · '+esc(p.contact||'بدون مسؤول')+' · '+esc(p.city||'—')+'</div></div>'+status(p.verification)+'</div><div class="meta"><span>هاتف: '+esc(p.phone||'—')+'</span><span>الفئات: '+esc((p.categories||[]).join('، ')||'—')+'</span><span>تقييم: '+(rating(p.email,p.role)||p.rating||'جديد')+'</span></div>' +(p.role==='supplier'?'<div class="docs"><span class="doc '+(d.commercial?'ok':'')+'">تجاري '+(d.commercial?'✓':'—')+'</span><span class="doc '+(d.tax?'ok':'')+'">ضريبي '+(d.tax?'✓':'—')+'</span><span class="doc '+(d.signer?'ok':'')+'">مفوض '+(d.signer?'✓':'—')+'</span></div>':'')+'<div class="actions" style="margin-top:11px">'+buttons+'</div></article>'});
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
    var html=modalHead('طلب شراء جديد','أدخل البنود بدقة حتى يستقبل الموردون طلبًا قابلًا للتسعير.')+'<div class="form"><div class="grid2"><label class="label">اسم الشركة <span class="required">*</span><input id="rCompany" value="'+esc(p.company||'')+'"></label><label class="label">اسم المشروع <span class="required">*</span><input id="rProject" placeholder="مثال: تشطيب فيلا بالتجمع"></label><label class="label">الفئة <span class="required">*</span><select id="rCategory"><option>سباكة ومواسير PPR</option><option>مواسير PVC / UPVC</option><option>أدوات صحية</option><option>كهرباء وإضاءة</option><option>دهانات وتشطيبات</option><option>أخرى</option></select></label><label class="label">نوع الطلب <select id="rType"><option>طلب حقيقي</option><option>طلب تجريبي</option></select></label><label class="label">مكان التوريد <span class="required">*</span><input id="rLocation" value="'+esc(p.city||'')+'" placeholder="المنطقة / الموقع"></label><label class="label">آخر موعد للعروض <span class="required">*</span><input id="rDeadline" type="date" value="'+due+'"></label><label class="label">شروط الدفع المطلوبة <select id="rPayment"><option>نقدي</option><option>أجل 15 يوم</option><option selected>أجل 30 يوم</option><option>أجل 60 يوم</option></select></label><label class="label">المرفقات <input id="rFiles" type="file" multiple accept=".pdf,.xlsx,.xls,.doc,.docx,.jpg,.jpeg,.png"><small class="form-note">تظهر أسماء الملفات في نموذج العرض المحلي.</small></label></div><label class="label">ملاحظات للموردين<textarea id="rNotes" placeholder="الماركة المطلوبة، دفعات التوريد، متطلبات الجودة..."></textarea></label><div><div class="card-row"><b>بنود الطلب <span class="required">*</span></b><button type="button" class="btn soft tiny" onclick="addLine()">+ إضافة بند</button></div><div id="rItems" class="items"></div></div><button type="button" class="btn primary full" onclick="saveRequest()">نشر طلب الشراء</button></div>';
    openModal(html);addLine();
  }
  window.addLine=function(data){
    var box=$('rItems'),row=document.createElement('div');row.className='item';
    row.innerHTML='<label class="label item-name">الصنف <span class="required">*</span><input class="li-name" value="'+esc(data&&data.name||'')+'" placeholder="مثال: ماسورة PPR 20 مم"></label><label class="label">الكمية <span class="required">*</span><input class="li-qty" type="number" min="1" value="'+esc(data&&data.qty||1)+'"></label><label class="label">الوحدة <span class="required">*</span><input class="li-unit" value="'+esc(data&&data.unit||'متر')+'"></label><label class="label">المواصفات<input class="li-spec" value="'+esc(data&&data.spec||'')+'" placeholder="ضغط / مقاس / ماركة"></label><button type="button" class="btn danger tiny" onclick="delLine(this)">حذف</button>';
    box.appendChild(row);
  }
  window.delLine=function(btn){var b=$('rItems');if(b.children.length===1)return modalError('يجب إدخال بند واحد على الأقل.');btn.closest('.item').remove()}
  window.saveRequest=function(){
    var company=$('rCompany').value.trim(),project=$('rProject').value.trim(),location=$('rLocation').value.trim(),deadline=$('rDeadline').value;
    if(!company)return modalError('اكتب اسم الشركة.');if(!project)return modalError('اكتب اسم المشروع.');if(!location)return modalError('اكتب مكان التوريد.');if(!deadline)return modalError('حدد آخر موعد للعروض.');
    var lines=Array.from(document.querySelectorAll('.item')),items=[];
    for(var i=0;i<lines.length;i++){var name=lines[i].querySelector('.li-name').value.trim(),qty=Number(lines[i].querySelector('.li-qty').value||0),unit=lines[i].querySelector('.li-unit').value.trim(),spec=lines[i].querySelector('.li-spec').value.trim();if(!name||qty<=0||!unit)return modalError('راجع اسم الصنف والكمية والوحدة في كل بند.');items.push({id:uid('IT'),name:name,qty:qty,unit:unit,spec:spec})}
    var attachments=Array.from($('rFiles').files||[]).map(function(f){return {name:f.name,size:f.size}});
    var r={id:uid('RFQ'),number:'RFQ-'+next('rfq'),buyerEmail:session.email,company:company,project:project,category:$('rCategory').value,type:$('rType').value,location:location,deadline:deadline,payment:$('rPayment').value,notes:$('rNotes').value.trim(),attachments:attachments,status:'مفتوح لاستقبال العروض',createdAt:now(),items:items};
    db.rfqs.unshift(r);addLog('تم نشر '+r.number+' لاستقبال عروض الموردين.');closeModal();save();flash('تم نشر طلب الشراء بنجاح');
  }
  window.closeRequest=function(id){var r=db.rfqs.find(function(x){return x.id===id});if(!r)return;if(!confirm('سيتم إغلاق الطلب ولن تظهر له عروض جديدة. هل تريد المتابعة؟'))return;r.status='مغلق';addLog('تم إغلاق '+r.number);save();flash('تم إغلاق الطلب')}
  window.requestDetails=function(id){
    var r=db.rfqs.find(function(x){return x.id===id});if(!r)return;
    var rows=(r.items||[]).map(function(i){return '<tr><td>'+esc(i.name)+'</td><td>'+esc(i.qty)+'</td><td>'+esc(i.unit)+'</td><td>'+esc(i.spec||'—')+'</td></tr>'}).join('');
    var files=(r.attachments||[]).length?(r.attachments||[]).map(function(f){return '<span class="doc ok">📎 '+esc(f.name)+' · '+Math.round(Number(f.size||0)/1024)+' KB</span>'}).join(''):'<span class="muted small">لا توجد مرفقات.</span>';
    var a='';
    if(session.role==='supplier'&&r.status==='مفتوح لاستقبال العروض')a+=cmd('openQuote',r.id,'تقديم عرض','primary');
    if((session.role==='admin'||session.role==='buyer'&&r.buyerEmail===session.email)&&db.quotes.some(function(q){return q.rfqId===r.id}))a+=cmd('compare',r.id,'المقارنة الذكية','navy');
    openModal(modalHead(esc(r.number)+' — '+esc(r.project),'تفاصيل طلب الشراء والبنود المتاحة للتسعير.')+'<div class="meta"><span>العميل: '+esc(r.company)+'</span><span>الفئة: '+esc(r.category)+'</span><span>المكان: '+esc(r.location)+'</span><span>الدفع: '+esc(r.payment)+'</span><span>آخر موعد: '+date(r.deadline)+'</span><span>الحالة: '+esc(r.status)+'</span></div><p class="small">'+esc(r.notes||'لا توجد ملاحظات إضافية.')+'</p><div class="table-wrap"><table><thead><tr><th>الصنف</th><th>الكمية</th><th>الوحدة</th><th>المواصفات</th></tr></thead><tbody>'+rows+'</tbody></table></div><h3 style="margin:16px 0 7px;font-size:15px">المرفقات</h3><div class="docs">'+files+'</div><div class="actions" style="margin-top:16px">'+a+'</div>');
  }

  window.openQuote=function(rfqId){
    var r=db.rfqs.find(function(x){return x.id===rfqId});if(!r)return;
    var old=db.quotes.find(function(q){return q.rfqId===rfqId&&q.supplierEmail===session.email}),p=me(),oldItems=old?old.items:[];
    var lines=r.items.map(function(it){
      var o=oldItems.find(function(x){return x.itemId===it.id})||{};
      return '<div class="quote-item quote-line" data-id="'+esc(it.id)+'"><div><b>'+esc(it.name)+'</b><small class="muted">'+esc(it.qty)+' '+esc(it.unit)+' · '+esc(it.spec||'—')+'</small></div><label class="label">سعر الوحدة<input class="q-price" type="number" min="0" value="'+esc(o.unitPrice||'')+'"></label><label class="label">التوفر<select class="q-available"><option '+(o.availability==='متوفر'?'selected':'')+'>متوفر</option><option '+(o.availability==='متوفر جزئيًا'?'selected':'')+'>متوفر جزئيًا</option><option '+(o.availability==='غير متوفر'?'selected':'')+'>غير متوفر</option></select></label><label class="label">الماركة<input class="q-brand" value="'+esc(o.brand||'')+'"></label><label class="label">المنشأ<input class="q-origin" value="'+esc(o.origin||'')+'"></label><label class="label">الضمان / البديل<input class="q-warranty" value="'+esc(o.warranty||'')+'"></label></div>';
    }).join('');
    var html=modalHead(old?'تحديث عرض السعر':'عرض سعر تفصيلي','كل بند واضح للعميل: السعر، التوفر، الماركة، والضمان.')+'<div class="form"><div class="grid3"><label class="label">اسم المورد <span class="required">*</span><input id="qSupplier" value="'+esc(old?old.supplier:p.company||'')+'"></label><label class="label">مدة التوريد (يوم)<input id="qDays" type="number" min="1" value="'+esc(old?old.deliveryDays:p.leadTime||3)+'"></label><label class="label">صلاحية العرض (أيام)<input id="qValidity" type="number" min="1" value="'+esc(old?old.validity:7)+'"></label></div><div>'+lines+'</div><div class="grid3"><label class="label">الخصم الإجمالي<input id="qDiscount" type="number" min="0" value="'+esc(old?old.discount:0)+'"></label><label class="label">النقل<input id="qShipping" type="number" min="0" value="'+esc(old?old.shipping:0)+'"></label><label class="label">الضريبة / رسوم أخرى<input id="qTax" type="number" min="0" value="'+esc(old?(Number(old.tax||0)+Number(old.other||0)):0)+'"></label></div><div class="grid2"><label class="label">شروط الدفع <input id="qPayment" value="'+esc(old?old.payment:p.paymentTerms||'نقدي')+'"></label><label class="label">ملاحظات للعميل<textarea id="qNotes">'+esc(old?old.notes||'':'')+'</textarea></label></div><div class="notice"><div><b>سياسة المورد المؤسس</b>أول 3 مبيعات ناجحة بلا رسوم، وبعدها تظهر أي رسوم نجاح بوضوح قبل تقديم العرض.</div></div><button type="button" class="btn primary full" onclick="saveQuote(&quot;'+esc(rfqId)+'&quot;)">'+(old?'حفظ تحديث العرض':'إرسال العرض')+'</button></div>';
    openModal(html);
  }
  window.saveQuote=function(rfqId){
    var r=db.rfqs.find(function(x){return x.id===rfqId});if(!r)return;
    var supplier=$('qSupplier').value.trim();if(!supplier)return modalError('اكتب اسم المورد.');
    var lines=Array.from(document.querySelectorAll('.quote-line')),items=[],sum=0;
    for(var i=0;i<lines.length;i++){
      var id=lines[i].getAttribute('data-id'),src=r.items.find(function(x){return x.id===id}),price=Number(lines[i].querySelector('.q-price').value||0),availability=lines[i].querySelector('.q-available').value;
      if(price<0)return modalError('سعر الوحدة لا يمكن أن يكون سالبًا.');
      var sub=price*Number(src.qty||0);sum+=sub;
      items.push({itemId:id,name:src.name,qty:src.qty,unit:src.unit,unitPrice:price,subtotal:sub,availability:availability,brand:lines[i].querySelector('.q-brand').value.trim(),origin:lines[i].querySelector('.q-origin').value.trim(),warranty:lines[i].querySelector('.q-warranty').value.trim()});
    }
    if(sum<=0)return modalError('أدخل سعرًا صالحًا لبند واحد على الأقل.');
    var old=db.quotes.find(function(q){return q.rfqId===rfqId&&q.supplierEmail===session.email});
    var data={id:old?old.id:uid('Q'),number:old?old.number:'Q-'+next('quote'),rfqId:rfqId,supplierEmail:session.email,supplier:supplier,items:items,itemsTotal:sum,discount:Number($('qDiscount').value||0),shipping:Number($('qShipping').value||0),tax:Number($('qTax').value||0),other:0,deliveryDays:Number($('qDays').value||0),validity:Number($('qValidity').value||0),payment:$('qPayment').value.trim(),notes:$('qNotes').value.trim(),status:old?old.status||'مُرسل':'مُرسل',createdAt:old?old.createdAt:now(),updatedAt:now()};
    if(old)Object.assign(old,data);else db.quotes.unshift(data);
    addLog((old?'تم تحديث ':'وصل ')+'عرض '+data.number+' على '+r.number);closeModal();save();flash(old?'تم تحديث العرض':'تم إرسال العرض');
  }
  window.quoteDetails=function(id){
    var q=db.quotes.find(function(x){return x.id===id});if(!q)return;var r=db.rfqs.find(function(x){return x.id===q.rfqId});
    var rows=(q.items||[]).map(function(i){return '<tr><td>'+esc(i.name)+'</td><td>'+esc(i.qty)+' '+esc(i.unit)+'</td><td>'+money(i.unitPrice)+'</td><td>'+money(i.subtotal)+'</td><td>'+esc(i.availability)+'</td><td>'+esc(i.brand||'—')+'</td><td>'+esc(i.origin||'—')+'</td><td>'+esc(i.warranty||'—')+'</td></tr>'}).join('');
    openModal(modalHead('عرض '+esc(q.number),'عرض تفصيلي من '+esc(q.supplier)+' على '+esc(r?r.number:'طلب')+'.')+'<div class="meta"><span>إجمالي البنود: '+money(q.itemsTotal)+'</span><span>خصم: '+money(q.discount)+'</span><span>نقل: '+money(q.shipping)+'</span><span>الضريبة / الرسوم: '+money(Number(q.tax||0)+Number(q.other||0))+'</span><span>الإجمالي: '+money(total(q))+'</span><span>التسليم: '+esc(q.deliveryDays)+' يوم</span></div><div class="table-wrap"><table><thead><tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th>التوفر</th><th>الماركة</th><th>المنشأ</th><th>الضمان</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="muted small" style="margin-top:13px"><b>شروط الدفع:</b> '+esc(q.payment||'—')+'<br><b>ملاحظات:</b> '+esc(q.notes||'—')+'</p>');
  }
  window.compare=function(rfqId){
    var r=db.rfqs.find(function(x){return x.id===rfqId});if(!r)return;var q=db.quotes.filter(function(x){return x.rfqId===rfqId});
    if(!q.length){flash('لا توجد عروض للمقارنة بعد.');return}
    var rows=r.items.map(function(item){
      var all=q.filter(function(x){return valid(x,item.id)}).sort(function(a,b){return Number(qItem(a,item.id).subtotal)-Number(qItem(b,item.id).subtotal)});
      var opts='<option value="">اختر المورد</option>'+all.map(function(x){var i=qItem(x,item.id);return '<option value="'+esc(x.id)+'" '+(x.id===(all[0]&&all[0].id)?'selected':'')+'>'+esc(x.supplier)+' — '+money(i.subtotal)+' ('+esc(i.availability)+')</option>'}).join('');
      return '<tr><td><b>'+esc(item.name)+'</b><br><small class="muted">'+esc(item.qty)+' '+esc(item.unit)+' · '+esc(item.spec||'—')+'</small></td><td><select class="compare-select" data-item="'+esc(item.id)+'" onchange="recalc(&quot;'+esc(r.id)+'&quot;)">'+opts+'</select></td><td id="cp-'+esc(item.id)+'">'+(all.length?money(qItem(all[0],item.id).subtotal):'—')+'</td><td>'+(all.length?esc(qItem(all[0],item.id).availability):'لا يوجد عرض صالح')+'</td></tr>';
    }).join('');
    openModal(modalHead('المقارنة الذكية وتقسيم الطلب','اختر موردًا لكل بند. الاقتراح الافتراضي هو أقل عرض صالح للبند.')+'<div class="notice"><div><b>الاختيار ليس تلقائيًا</b>يمكنك تغيير المورد المقترح حسب الجودة والماركة ومدة التوريد، ثم إصدار أوامر شراء منفصلة تلقائيًا.</div></div><div class="table-wrap"><table><thead><tr><th>البند</th><th>المورد المختار</th><th>إجمالي البند</th><th>التوفر</th></tr></thead><tbody>'+rows+'</tbody></table></div><div id="compareSummary"></div><div class="actions" style="margin-top:15px"><button type="button" class="btn primary" onclick="createOrders(&quot;'+esc(r.id)+'&quot;)">إصدار أوامر الشراء المختارة</button><button type="button" class="btn ghost" onclick="closeModal()">رجوع</button></div>');
    recalc(rfqId);
  }
  window.recalc=function(rfqId){
    var r=db.rfqs.find(function(x){return x.id===rfqId});if(!r)return;var sels=Array.from(document.querySelectorAll('.compare-select')),groups={};
    sels.forEach(function(s){var q=db.quotes.find(function(x){return x.id===s.value}),item=r.items.find(function(x){return x.id===s.getAttribute('data-item')}),target=$('cp-'+item.id);if(!q){if(target)target.textContent='—';return}var qi=qItem(q,item.id);if(target)target.textContent=money(qi.subtotal);if(!groups[q.id])groups[q.id]={q:q,items:[]};groups[q.id].items.push(qi)});
    var totalSplit=Object.keys(groups).reduce(function(s,k){return s+allocated(groups[k].q,groups[k].items)},0);
    var full=db.quotes.filter(function(q){return r.items.every(function(i){return valid(q,i.id)})}),single=full.length?Math.min.apply(null,full.map(total)):0;
    $('compareSummary').innerHTML='<div class="split-summary"><div><span>عدد أوامر الشراء</span><b>'+Object.keys(groups).length+'</b></div><div><span>إجمالي الاختيار الحالي</span><b>'+money(totalSplit)+'</b></div><div><span>وفر مقابل أفضل عرض موحد</span><b>'+(single?money(Math.max(0,single-totalSplit)):'لا يوجد عرض موحد')+'</b></div></div>';
  }
  window.createOrders=function(rfqId){
    var r=db.rfqs.find(function(x){return x.id===rfqId});if(!r)return;var sels=Array.from(document.querySelectorAll('.compare-select')),groups={};
    for(var i=0;i<sels.length;i++){var q=db.quotes.find(function(x){return x.id===sels[i].value}),item=r.items.find(function(x){return x.id===sels[i].getAttribute('data-item')});if(!q)return modalError('اختر موردًا صالحًا لكل بند قبل إصدار الأمر.');var qi=qItem(q,item.id);if(!qi)return modalError('تعذر ربط بند بالعرض المختار.');if(!groups[q.id])groups[q.id]={q:q,items:[]};groups[q.id].items.push(qi)}
    var old=db.pos.filter(function(p){return p.rfqId===rfqId});if(old.length&&!confirm('سيتم استبدال أوامر الشراء السابقة لهذا الطلب بالاختيار الجديد. هل تريد المتابعة؟'))return;
    db.pos=db.pos.filter(function(p){return p.rfqId!==rfqId});
    Object.keys(groups).forEach(function(k){var g=groups[k],q=g.q;db.pos.unshift({id:uid('PO'),number:'PO-'+next('po'),rfqId:r.id,rfqNumber:r.number,buyerEmail:r.buyerEmail,supplierEmail:q.supplierEmail,buyer:r.company,supplier:q.supplier,project:r.project,items:g.items.map(function(i){return {itemId:i.itemId,name:i.name,qty:i.qty,unit:i.unit,unitPrice:i.unitPrice,subtotal:i.subtotal}}),total:allocated(q,g.items),payment:q.payment||r.payment,deliveryDays:q.deliveryDays,status:'بانتظار تأكيد المورد',createdAt:now(),notes:q.notes||''})});
    db.quotes.filter(function(q){return q.rfqId===rfqId}).forEach(function(q){var g=groups[q.id];q.status=g?(g.items.length===r.items.length?'فاز كليًا':'فاز جزئيًا'):'لم يتم الاختيار'});
    r.status='تم إصدار أوامر شراء';addLog('تم إصدار '+Object.keys(groups).length+' أمر شراء من '+r.number);closeModal();save();flash('تم إصدار أوامر الشراء بنجاح');
  }

  window.poDetails=function(id){
    var p=db.pos.find(function(x){return x.id===id});if(!p)return;
    var rows=(p.items||[]).map(function(i){return '<tr><td>'+esc(i.name)+'</td><td>'+esc(i.qty)+' '+esc(i.unit)+'</td><td>'+money(i.unitPrice)+'</td><td>'+money(i.subtotal)+'</td></tr>'}).join('');
    var flow=['بانتظار تأكيد المورد','قيد التجهيز','خرج للتوريد','تم التسليم','مستلم من العميل'],at=flow.indexOf(p.status);
    var steps=flow.map(function(x,i){return '<div class="step" style="min-width:125px;opacity:'+(i<=at?'1':'.45')+'"><i>'+(i+1)+'</i><b>'+esc(x)+'</b></div>'}).join('');
    openModal(modalHead(esc(p.number),'أمر شراء مرتبط بـ '+esc(p.rfqNumber||'طلب شراء')+'.')+'<div class="meta"><span>العميل: '+esc(p.buyer||nameOf(p.buyerEmail,'buyer'))+'</span><span>المورد: '+esc(p.supplier)+'</span><span>الدفع: '+esc(p.payment||'—')+'</span><span>مدة التوريد: '+esc(p.deliveryDays||'—')+' يوم</span><span>الحالة: '+esc(p.status)+'</span></div><div class="table-wrap"><table><thead><tr><th>البند</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead><tbody>'+rows+'</tbody></table></div><div class="split-summary"><div><span>إجمالي الأمر</span><b>'+money(p.total)+'</b></div><div><span>رقم الطلب</span><b>'+esc(p.rfqNumber||'—')+'</b></div><div><span>الفاتورة والدفع</span><b>مباشرة بين العميل والمورد</b></div></div><div class="flow" style="grid-template-columns:repeat(5,1fr)">'+steps+'</div><p class="muted small" style="margin-top:13px">'+esc(p.notes||'')+'</p>');
  }
  window.advancePo=function(id,nextStatus){var p=db.pos.find(function(x){return x.id===id});if(!p)return;p.status=nextStatus;p.updatedAt=now();addLog('تم تحديث '+p.number+' إلى: '+nextStatus);save();flash('تم تحديث حالة أمر التوريد')}
  window.receivePo=function(id){var p=db.pos.find(function(x){return x.id===id});if(!p)return;p.status='مستلم من العميل';p.receivedAt=now();addLog('أكد العميل استلام '+p.number);save();flash('تم تأكيد الاستلام. يمكنك الآن تقييم المورد.');setTimeout(function(){openRating(id)},300)}
  window.openRating=function(poId){
    var p=db.pos.find(function(x){return x.id===poId});if(!p)return;
    if(session.role==='admin'){flash('التقييم المتبادل متاح للعميل والمورد فقط.');return}
    var toRole=session.role==='buyer'?'supplier':'buyer',toEmail=toRole==='supplier'?p.supplierEmail:p.buyerEmail,old=db.ratings.find(function(r){return r.poId===poId&&r.fromEmail===session.email&&r.fromRole===session.role});
    if(old){flash('تم تسجيل تقييمك لهذا الأمر بالفعل.');return}
    openModal(modalHead('تقييم بعد التنفيذ','تقييمك يساعد على بناء سجل ثقة حقيقي داخل صِلَة.')+'<div class="form"><div class="notice"><div><b>تقييم '+esc(nameOf(toEmail,toRole))+'</b>يركز على التوريد والجودة والتواصل، وليس على السعر وحده.</div></div><div class="grid3"><label class="label">الالتزام بالتوريد<select id="rateDelivery"><option value="5">5 — ممتاز</option><option value="4">4 — جيد جدًا</option><option value="3">3 — جيد</option><option value="2">2 — ضعيف</option><option value="1">1 — ضعيف جدًا</option></select></label><label class="label">الجودة والمطابقة<select id="rateQuality"><option value="5">5 — ممتاز</option><option value="4">4 — جيد جدًا</option><option value="3">3 — جيد</option><option value="2">2 — ضعيف</option><option value="1">1 — ضعيف جدًا</option></select></label><label class="label">التواصل والاستجابة<select id="rateCommunication"><option value="5">5 — ممتاز</option><option value="4">4 — جيد جدًا</option><option value="3">3 — جيد</option><option value="2">2 — ضعيف</option><option value="1">1 — ضعيف جدًا</option></select></label></div><label class="label">تعليق مختصر<textarea id="rateComment" placeholder="اكتب ملاحظة تساعد الطرف الآخر."></textarea></label><button type="button" class="btn primary full" onclick="saveRating(&quot;'+esc(poId)+'&quot;)">حفظ التقييم</button></div>');
  }
  window.saveRating=function(poId){
    var p=db.pos.find(function(x){return x.id===poId});if(!p)return;
    var toRole=session.role==='buyer'?'supplier':'buyer',toEmail=toRole==='supplier'?p.supplierEmail:p.buyerEmail,delivery=Number($('rateDelivery').value),quality=Number($('rateQuality').value),communication=Number($('rateCommunication').value),overall=Math.round((delivery+quality+communication)/3*10)/10;
    db.ratings.unshift({id:uid('RATE'),poId:poId,fromEmail:session.email,fromRole:session.role,toEmail:toEmail,toRole:toRole,overall:overall,delivery:delivery,quality:quality,communication:communication,comment:$('rateComment').value.trim(),createdAt:now()});
    var target=profile(toEmail,toRole);if(target){target.rating=rating(toEmail,toRole);if(toRole==='supplier')target.operational=Math.round(Math.min(100,75+target.rating*5))}
    addLog('تم تسجيل تقييم متبادل على '+p.number);closeModal();save();flash('شكرًا، تم حفظ التقييم');
  }

  window.openProfile=function(){
    var p=me(),d=docs(p),isSupplier=p.role==='supplier',isBuyer=p.role==='buyer';
    var html=modalHead(isSupplier?'استكمال ملف المورد':'استكمال ملف الشركة','هذه البيانات تظهر للطرف الآخر بعد مراجعة الإدارة.')+'<div class="form"><div class="grid2"><label class="label">اسم الشركة <span class="required">*</span><input id="pCompany" value="'+esc(p.company||'')+'"></label><label class="label">المسؤول <span class="required">*</span><input id="pContact" value="'+esc(p.contact||'')+'"></label><label class="label">الهاتف / واتساب <span class="required">*</span><input id="pPhone" value="'+esc(p.phone||'')+'"></label><label class="label">المحافظة / المنطقة <span class="required">*</span><input id="pCity" value="'+esc(p.city||'القاهرة')+'"></label></div>';
    if(isSupplier)html+='<div class="grid2"><label class="label">الفئات التي توردها <input id="pCategories" value="'+esc((p.categories||[]).join('، '))+'" placeholder="مثال: PPR، PVC، UPVC"></label><label class="label">الماركات / المصنعون <input id="pBrands" value="'+esc(p.brands||'')+'"></label><label class="label">شروط الدفع المتاحة <input id="pTerms" value="'+esc(p.paymentTerms||'نقدي')+'"></label><label class="label">متوسط مدة التوريد (يوم)<input id="pLead" type="number" min="0" value="'+esc(p.leadTime||3)+'"></label></div><div class="card"><div class="title">مستندات التحقق</div><p class="muted small">في النظام الإنتاجي تُرفع الملفات إلى تخزين آمن. هنا تسجل وجودها في نموذج العرض.</p><div class="grid3"><label class="check"><input id="pCom" type="checkbox" '+(d.commercial?'checked':'')+'> السجل التجاري متوفر</label><label class="check"><input id="pTax" type="checkbox" '+(d.tax?'checked':'')+'> البطاقة الضريبية متوفرة</label><label class="check"><input id="pSigner" type="checkbox" '+(d.signer?'checked':'')+'> المفوض بالتوقيع متوفر</label></div></div>';
    if(isBuyer)html+='<div class="grid2"><label class="label">مجالات الشراء <input id="pCategories" value="'+esc((p.categories||[]).join('، '))+'" placeholder="مثال: تشطيبات، سباكة"></label><label class="label">شروط الدفع المعتادة <input id="pTerms" value="'+esc(p.paymentTerms||'نقدي')+'"></label></div>';
    html+='<button type="button" class="btn primary full" onclick="saveProfile()">حفظ وإرسال للمراجعة</button></div>';
    openModal(html);
  }
  window.saveProfile=function(){
    var p=me(),company=$('pCompany').value.trim(),contact=$('pContact').value.trim(),phone=$('pPhone').value.trim(),city=$('pCity').value.trim();
    if(!company||!contact||!phone||!city)return modalError('أكمل اسم الشركة والمسؤول والهاتف والمنطقة.');
    p.company=company;p.name=company;p.contact=contact;p.phone=phone;p.city=city;
    var cats=$('pCategories');if(cats)p.categories=cats.value.split(/[،,]/).map(function(x){return x.trim()}).filter(Boolean);
    var terms=$('pTerms');if(terms)p.paymentTerms=terms.value.trim();
    if(p.role==='supplier'){p.brands=$('pBrands').value.trim();p.leadTime=Number($('pLead').value||0);p.docs={commercial:$('pCom').checked,tax:$('pTax').checked,signer:$('pSigner').checked};p.verification=p.docs.commercial&&p.docs.tax&&p.docs.signer?'قيد المراجعة':'غير مكتمل'}else if(p.role==='buyer')p.verification='قيد المراجعة';
    addLog('تم تحديث ملف '+roleName(p.role)+' وإرساله للمراجعة.');closeModal();save();flash('تم حفظ الملف');
  }
  window.adminProfile=function(id){
    var p=db.profiles.find(function(x){return x.id===id});if(!p)return;var d=docs(p),first=esc((p.company||p.email).charAt(0));
    openModal(modalHead('ملف '+esc(p.company||p.email),'مراجعة بيانات الحساب قبل الاعتماد.')+'<div class="profile-hero"><div class="profile-main"><div class="avatar">'+first+'</div><div><h3>'+esc(p.company||p.email)+'</h3><p>'+esc(roleName(p.role))+' · '+esc(p.email)+'</p></div></div>'+status(p.verification)+'</div><div class="meta"><span>المسؤول: '+esc(p.contact||'—')+'</span><span>هاتف: '+esc(p.phone||'—')+'</span><span>المنطقة: '+esc(p.city||'—')+'</span><span>الفئات: '+esc((p.categories||[]).join('، ')||'—')+'</span><span>الدفع: '+esc(p.paymentTerms||'—')+'</span></div>'+(p.role==='supplier'?'<div class="docs"><span class="doc '+(d.commercial?'ok':'')+'">السجل التجاري '+(d.commercial?'متوفر':'غير متوفر')+'</span><span class="doc '+(d.tax?'ok':'')+'">البطاقة الضريبية '+(d.tax?'متوفرة':'غير متوفرة')+'</span><span class="doc '+(d.signer?'ok':'')+'">المفوض '+(d.signer?'متوفر':'غير متوفر')+'</span></div>':'')+'<div class="actions" style="margin-top:16px">'+cmd('reviewProfile',[p.id,'موثق'],'اعتماد الحساب','primary')+cmd('reviewProfile',[p.id,'مرفوض'],'رفض','danger')+'</div>');
  }
  window.reviewProfile=function(id,st){var p=db.profiles.find(function(x){return x.id===id});if(!p)return;p.verification=st;if(st==='موثق'){if(!p.operational)p.operational=p.role==='supplier'?82:80;if(!p.financial)p.financial=p.role==='buyer'?75:80}addLog('تم '+(st==='موثق'?'اعتماد':'رفض')+' حساب '+(p.company||p.email));closeModal();save();flash(st==='موثق'?'تم اعتماد الحساب':'تم رفض الحساب')}

  window.openCredit=function(){var p=me();openModal(modalHead('طلب حد ائتماني','ترفع الإدارة الطلب للمراجعة، بينما يظل قبول الشراء الآجل قرار المورد.')+'<div class="form"><div class="grid2"><label class="label">الحد المطلوب <input id="cAmount" type="number" min="1" value="'+esc(p.creditLimit||100000)+'"></label><label class="label">أيام السداد المطلوبة <select id="cDays"><option value="15">15 يوم</option><option value="30" selected>30 يوم</option><option value="60">60 يوم</option></select></label></div><label class="label">سبب الطلب<textarea id="cReason" placeholder="مثال: أوامر شراء لمشروع تشطيب قائم"></textarea></label><button type="button" class="btn primary full" onclick="saveCredit()">إرسال الطلب</button></div>')}
  window.saveCredit=function(){var amount=Number($('cAmount').value||0);if(amount<=0)return modalError('أدخل حدًا ائتمانيًا صحيحًا.');db.credits.unshift({id:uid('CR'),buyerEmail:session.email,amount:amount,days:Number($('cDays').value),reason:$('cReason').value.trim(),status:'قيد المراجعة',createdAt:now()});addLog('تم تقديم طلب حد ائتماني بقيمة '+smallMoney(amount));closeModal();save();flash('تم إرسال طلب الائتمان')}
  window.reviewCredit=function(id,st){var c=db.credits.find(function(x){return x.id===id});if(!c)return;c.status=st;c.reviewedAt=now();if(st==='معتمد'){var p=profile(c.buyerEmail,'buyer');if(p){p.creditLimit=Math.max(Number(p.creditLimit||0),Number(c.amount||0));p.creditRestricted=false;p.financial=Math.max(p.financial||0,75)}}addLog('تم '+(st==='معتمد'?'اعتماد':'رفض')+' طلب ائتمان '+id);save();flash(st==='معتمد'?'تم اعتماد الحد الائتماني':'تم رفض طلب الائتمان')}
  window.restrictCredit=function(id,value){var p=db.profiles.find(function(x){return x.id===id});if(!p)return;p.creditRestricted=value==='true';addLog((p.creditRestricted?'تم تقييد':'تم رفع قيد')+' الائتمان عن '+(p.company||p.email));save();flash(p.creditRestricted?'تم تقييد الائتمان':'تم رفع القيد الائتماني')}

  window.openDispute=function(poId){var p=db.pos.find(function(x){return x.id===poId});if(!p)return;openModal(modalHead('فتح نزاع على '+esc(p.number),'يسجل النزاع بسجل واضح حتى تراجعه الإدارة وتوثق الحل.')+'<div class="form"><label class="label">سبب النزاع<select id="dReason"><option>فرق في الكمية</option><option>مشكلة جودة أو مطابقة</option><option>تأخر في التوريد</option><option>مشكلة في السعر أو الشروط</option><option>سبب آخر</option></select></label><label class="label">التفاصيل <span class="required">*</span><textarea id="dDetails" placeholder="اكتب ما حدث بوضوح دون مشاركة بيانات حساسة."></textarea></label><button type="button" class="btn danger full" onclick="saveDispute(&quot;'+esc(poId)+'&quot;)">تسجيل النزاع</button></div>')}
  window.saveDispute=function(poId){var details=$('dDetails').value.trim();if(!details)return modalError('اكتب تفاصيل النزاع.');db.disputes.unshift({id:uid('DSP'),number:'DSP-'+String(db.disputes.length+1).padStart(4,'0'),poId:poId,openedByEmail:session.email,openedByRole:session.role,reason:$('dReason').value,details:details,status:'مفتوح',createdAt:now()});addLog('تم فتح نزاع على أمر التوريد '+poId);closeModal();save();flash('تم تسجيل النزاع وبانتظار مراجعة الإدارة')}
  window.disputeDetails=function(id){var d=db.disputes.find(function(x){return x.id===id});if(!d)return;var p=db.pos.find(function(x){return x.id===d.poId});openModal(modalHead(esc(d.number||d.id),'تفاصيل النزاع وسجل المراجعة.')+'<div class="meta"><span>الأمر: '+esc(p?p.number:'—')+'</span><span>فتح بواسطة: '+esc(nameOf(d.openedByEmail,d.openedByRole))+'</span><span>التاريخ: '+time(d.createdAt)+'</span><span>الحالة: '+esc(d.status)+'</span></div><h3 style="font-size:15px">السبب: '+esc(d.reason)+'</h3><p class="muted">'+esc(d.details)+'</p>'+(session.role==='admin'&&d.status==='مفتوح'?cmd('solveDispute',[d.id,'تم الحل'],'إغلاق بعد الحل','primary'):''))}
  window.solveDispute=function(id,st){var d=db.disputes.find(function(x){return x.id===id});if(!d)return;d.status=st;d.resolvedAt=now();addLog('تم إغلاق النزاع '+(d.number||d.id));closeModal();save();flash('تم تحديث حالة النزاع')}

  window.downloadBackup=function(){var b=new Blob([JSON.stringify(db,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='silah-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},500);flash('تم تنزيل النسخة الاحتياطية')}
  window.triggerImport=function(){$('importFile').click()}
  $('importFile').addEventListener('change',function(){var f=this.files&&this.files[0];if(!f)return;var rd=new FileReader();rd.onload=function(){try{var x=normalize(JSON.parse(rd.result));if(!x.version)throw new Error('bad');db=x;save();flash('تم استرجاع البيانات بنجاح')}catch(e){flash('ملف النسخة الاحتياطية غير صالح')}};rd.readAsText(f);this.value=''});

  roleNote();
  render();
})();
