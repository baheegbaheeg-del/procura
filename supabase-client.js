/* global supabase */
(function () {
  'use strict';

  var config = window.SILAH_SUPABASE || {};
  var enabled = Boolean(config.url && config.publishableKey && window.supabase && window.supabase.createClient);
  var client = enabled ? window.supabase.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;
  var realtimeChannel = null;

  function fail(error) { if (error) throw error; }
  function requireClient() {
    if (!client) throw new Error('لم يتم إعداد الاتصال السحابي بعد. أضف رابط المشروع والمفتاح العام في supabase-config.js.');
    return client;
  }
  function array(value) { return Array.isArray(value) ? value : []; }
  function number(value) { var n = Number(value); return isFinite(n) && n > 0 ? n : 0; }
  function filePath(userId, fileId, name) {
    return String(userId) + '/' + String(fileId) + '-' + String(name || 'file').replace(/[^\w.\-\u0600-\u06FF]/g, '_');
  }
  async function requireUser() {
    var user = await currentUser();
    if (!user) throw new Error('سجّل الدخول أولًا.');
    return user;
  }

  async function signIn(email, password) {
    var result = await requireClient().auth.signInWithPassword({ email: email, password: password });
    fail(result.error);
    return result.data;
  }
  async function signUp(email, password, role) {
    if (role === 'admin') throw new Error('لا يمكن إنشاء حساب إدارة من هذه الشاشة.');
    var result = await requireClient().auth.signUp({
      email: email,
      password: password,
      options: { data: { role: role === 'supplier' ? 'supplier' : 'buyer' } }
    });
    fail(result.error);
    return result.data;
  }
  async function signOut() {
    if (!client) return;
    var result = await client.auth.signOut();
    fail(result.error);
  }
  async function currentUser() {
    if (!client) return null;
    var result = await client.auth.getUser();
    fail(result.error);
    return result.data.user || null;
  }
  async function getMyProfile() {
    var user = await currentUser();
    if (!user) return null;
    var result = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
    fail(result.error);
    return result.data;
  }
  function pause(milliseconds) {
    return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
  }
  async function waitForMyProfile(attempts, delayMilliseconds) {
    var maxAttempts = Math.max(1, Math.min(12, Number(attempts) || 8));
    var delay = Math.max(100, Math.min(1000, Number(delayMilliseconds) || 250));
    for (var index = 0; index < maxAttempts; index += 1) {
      var profile = await getMyProfile();
      if (profile) return profile;
      if (index < maxAttempts - 1) await pause(delay);
    }
    return null;
  }
  async function nextNumber(kind) {
    var result = await requireClient().rpc('next_silah_number', { p_kind: String(kind || '') });
    fail(result.error);
    return result.data;
  }

  async function updateMyProfile(profile) {
    var user = await requireUser();
    var payload = {
      company: String(profile.company || ''),
      contact_name: String(profile.contact || ''),
      phone: String(profile.phone || ''),
      city: String(profile.city || ''),
      categories: array(profile.categories),
      brands: String(profile.brands || ''),
      payment_terms: String(profile.paymentTerms || 'نقدي'),
      lead_time_days: Math.max(0, Math.round(number(profile.leadTime)))
    };
    var result = await client.from('profiles').update(payload).eq('id', user.id).select().single();
    fail(result.error);
    return result.data;
  }
  async function requestProfileReview() {
    var result = await requireClient().rpc('request_profile_review');
    fail(result.error);
    return result.data;
  }
  async function reviewProfile(profileId, status) {
    var result = await requireClient().rpc('review_profile', { p_profile_id: profileId, p_status: status });
    fail(result.error);
    return result.data;
  }

  async function uploadPrivateFile(bucketId, file, fileId) {
    var user = await requireUser();
    var path = filePath(user.id, fileId, file.name);
    var result = await client.storage.from(bucketId).upload(path, file, {
      upsert: false,
      contentType: file.type || undefined
    });
    fail(result.error);
    return {
      id: fileId,
      bucketId: bucketId,
      storagePath: result.data.path,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      createdAt: new Date().toISOString()
    };
  }
  async function signedUrl(bucketId, storagePath, seconds) {
    var result = await requireClient().storage.from(bucketId).createSignedUrl(storagePath, seconds || 120);
    fail(result.error);
    return result.data.signedUrl;
  }
  async function saveProfileDocument(type, details) {
    var user = await requireUser();
    var file = details && details.file;
    if (!file || !file.bucketId || !file.storagePath) throw new Error('ارفع ملف المستند أولًا.');
    var row = {
      owner_id: user.id,
      document_type: type,
      reference_number: String(details.referenceNumber || ''),
      signer_name: String(details.signerName || ''),
      signer_title: String(details.signerTitle || ''),
      bucket_id: file.bucketId,
      storage_path: file.storagePath,
      file_name: file.name || 'document',
      file_size: Math.round(number(file.size)),
      mime_type: file.type || 'application/octet-stream'
    };
    var result = await client.from('profile_documents').upsert(row, { onConflict: 'owner_id,document_type' }).select().single();
    fail(result.error);
    return result.data;
  }

  async function createAttachment(entityType, entityId, file) {
    var user = await requireUser();
    var row = {
      owner_id: user.id,
      entity_type: entityType,
      entity_id: entityId,
      bucket_id: file.bucketId,
      storage_path: file.storagePath,
      file_name: file.name || 'file',
      file_size: Math.round(number(file.size)),
      mime_type: file.type || 'application/octet-stream'
    };
    var result = await client.from('attachments').insert(row);
    fail(result.error);
    return row;
  }


  async function createRfq(rfq) {
    var user = await requireUser();
    var header = {
      number: rfq.number,
      buyer_id: user.id,
      company: rfq.company,
      project: rfq.project,
      category: rfq.category,
      location: rfq.location,
      deadline: rfq.deadline,
      payment: rfq.payment || 'نقدي',
      notes: rfq.notes || '',
      status: 'مفتوح لاستقبال العروض'
    };
    var inserted = await client.from('rfqs').insert(header).select().single();
    fail(inserted.error);
    var itemRows = array(rfq.items).map(function (item) {
      return {
        rfq_id: inserted.data.id,
        name: item.name,
        quantity: number(item.qty),
        unit: item.unit,
        specification: item.spec || ''
      };
    });
    if (itemRows.length) {
      var itemResult = await client.from('rfq_items').insert(itemRows);
      fail(itemResult.error);
    }
    return inserted.data;
  }
  async function updateRfqStatus(rfqId, status) {
    var result = await requireClient().from('rfqs').update({ status: status }).eq('id', rfqId).select().single();
    fail(result.error);
    return result.data;
  }

  async function submitQuote(quote) {
    var user = await requireUser();
    var header = {
      number: quote.number,
      rfq_id: quote.rfqId,
      supplier_id: user.id,
      supplier_name: quote.supplier,
      items_total: number(quote.itemsTotal),
      discount_rate: number(quote.discountRate),
      discount: number(quote.discount),
      net_total: number(quote.itemsTotal) - number(quote.discount),
      tax_rate: number(quote.taxRate),
      tax: number(quote.tax),
      shipping: number(quote.shipping),
      other: number(quote.other),
      total: number(quote.total),
      delivery_days: Math.round(number(quote.deliveryDays)),
      validity_days: Math.round(number(quote.validity)),
      payment: quote.payment || 'نقدي',
      notes: quote.notes || '',
      status: 'مُرسل'
    };
    var inserted = await client.from('quotes').upsert(header, { onConflict: 'rfq_id,supplier_id' }).select().single();
    fail(inserted.error);
    var deleted = await client.from('quote_items').delete().eq('quote_id', inserted.data.id);
    fail(deleted.error);
    var itemRows = array(quote.items).map(function (item) {
      return {
        quote_id: inserted.data.id,
        rfq_item_id: item.itemId || null,
        name: item.name,
        quantity: number(item.qty),
        unit: item.unit,
        unit_price: number(item.unitPrice),
        subtotal: number(item.subtotal),
        availability: item.availability || 'متوفر',
        brand: item.brand || '',
        origin: item.origin || '',
        warranty: item.warranty || ''
      };
    });
    if (itemRows.length) {
      var itemResult = await client.from('quote_items').insert(itemRows);
      fail(itemResult.error);
    }
    return inserted.data;
  }

  async function createPurchaseOrder(order) {
    var user = await requireUser();
    var header = {
      number: order.number,
      rfq_id: order.rfqId,
      quote_id: order.quoteId || null,
      buyer_id: order.buyerId || user.id,
      supplier_id: order.supplierId,
      project: order.project || '',
      payment: order.payment || 'نقدي',
      delivery_days: Math.round(number(order.deliveryDays)),
      pricing: order.pricing || {},
      total: number(order.total),
      status: 'بانتظار تأكيد المورد',
      notes: order.notes || ''
    };
    var inserted = await client.from('purchase_orders').insert(header).select().single();
    fail(inserted.error);
    var itemRows = array(order.items).map(function (item) {
      return {
        purchase_order_id: inserted.data.id,
        quote_item_id: item.quoteItemId || null,
        name: item.name,
        quantity: number(item.qty),
        unit: item.unit,
        unit_price: number(item.unitPrice),
        subtotal: number(item.subtotal)
      };
    });
    if (itemRows.length) {
      var itemResult = await client.from('po_items').insert(itemRows);
      fail(itemResult.error);
    }
    var eventResult = await client.from('po_status_events').insert({
      purchase_order_id: inserted.data.id,
      status: 'بانتظار تأكيد المورد',
      actor_id: user.id
    });
    fail(eventResult.error);
    return inserted.data;
  }
  async function setOrderStatus(orderId, nextStatus) {
    var result = await requireClient().rpc('transition_purchase_order', { p_order_id: orderId, p_next_status: nextStatus });
    fail(result.error);
    return result.data;
  }

  async function createCreditRequest(data) {
    var user = await requireUser();
    var result = await client.from('credit_requests').insert({
      buyer_id: user.id,
      amount: number(data.amount),
      days: Math.round(number(data.days)),
      reason: data.reason || ''
    }).select().single();
    fail(result.error);
    return result.data;
  }
  async function reviewCreditRequest(id, status) {
    var result = await requireClient().rpc('review_credit_request', { p_credit_id: id, p_status: status });
    fail(result.error);
    return result.data;
  }
  async function setCreditRestriction(buyerId, restricted) {
    var result = await requireClient().rpc('set_buyer_credit_restriction', { p_buyer_id: buyerId, p_restricted: Boolean(restricted) });
    fail(result.error);
    return result.data;
  }

  async function createDispute(dispute) {
    var user = await requireUser();
    var result = await client.from('disputes').insert({
      number: dispute.number,
      purchase_order_id: dispute.poId,
      opened_by: user.id,
      reason: dispute.reason,
      details: dispute.details,
      status: 'مفتوح'
    }).select().single();
    fail(result.error);
    return result.data;
  }
  async function resolveDispute(id, status) {
    var result = await requireClient().from('disputes').update({ status: status, resolved_at: new Date().toISOString() }).eq('id', id).select().single();
    fail(result.error);
    return result.data;
  }
  async function createRating(rating) {
    var user = await requireUser();
    var result = await client.from('ratings').insert({
      purchase_order_id: rating.poId,
      from_id: user.id,
      to_id: rating.toId,
      delivery: Math.round(number(rating.delivery)),
      quality: Math.round(number(rating.quality)),
      communication: Math.round(number(rating.communication)),
      overall: number(rating.overall),
      comment: rating.comment || ''
    }).select().single();
    fail(result.error);
    return result.data;
  }

  async function loadDashboard() {
    var api = requireClient();
    var results = await Promise.all([
      api.from('profiles').select('*'),
      api.from('profile_documents').select('*'),
      api.from('rfqs').select('*, rfq_items(*)'),
      api.from('quotes').select('*, quote_items(*)'),
      api.from('purchase_orders').select('*, po_items(*), po_status_events(*)'),
      api.from('attachments').select('*'),
      api.from('credit_requests').select('*'),
      api.from('ratings').select('*'),
      api.from('disputes').select('*')
    ]);
    results.forEach(function (result) { fail(result.error); });
    return {
      profiles: results[0].data,
      profileDocuments: results[1].data,
      rfqs: results[2].data,
      quotes: results[3].data,
      purchaseOrders: results[4].data,
      attachments: results[5].data,
      credits: results[6].data,
      ratings: results[7].data,
      disputes: results[8].data
    };
  }
  function subscribe(onChange) {
    if (!client || realtimeChannel) return;
    var tables = ['profiles', 'profile_documents', 'rfqs', 'quotes', 'purchase_orders', 'attachments', 'credit_requests', 'ratings', 'disputes', 'notifications'];
    realtimeChannel = client.channel('silah-live-updates');
    tables.forEach(function (table) {
      realtimeChannel.on('postgres_changes', { event: '*', schema: 'public', table: table }, onChange);
    });
    realtimeChannel.subscribe();
  }
  function unsubscribe() {
    if (client && realtimeChannel) client.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  window.SilahCloud = {
    enabled: function () { return enabled; },
    client: function () { return client; },
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    currentUser: currentUser,
    getMyProfile: getMyProfile,
    waitForMyProfile: waitForMyProfile,
    nextNumber: nextNumber,
    updateMyProfile: updateMyProfile,
    requestProfileReview: requestProfileReview,
    reviewProfile: reviewProfile,
    uploadPrivateFile: uploadPrivateFile,
    signedUrl: signedUrl,
    saveProfileDocument: saveProfileDocument,
    createAttachment: createAttachment,
    createRfq: createRfq,
    updateRfqStatus: updateRfqStatus,
    submitQuote: submitQuote,
    createPurchaseOrder: createPurchaseOrder,
    setOrderStatus: setOrderStatus,
    createCreditRequest: createCreditRequest,
    reviewCreditRequest: reviewCreditRequest,
    setCreditRestriction: setCreditRestriction,
    createDispute: createDispute,
    resolveDispute: resolveDispute,
    createRating: createRating,
    loadDashboard: loadDashboard,
    subscribe: subscribe,
    unsubscribe: unsubscribe
  };
})();
