/* EPSE 交卷结果补丁 v2
 *
 * 单机版内置任务（exam_category=1）在点击“确认交卷”后，原生逻辑会直接调用
 * updateExam(examProgress=3)。后端在单机模式下会把答案、成绩全部清空并把
 * 进度改回 1，前端随后跳回登录页，所以看起来像“交卷失败”。
 *
 * v2 修复：
 *   1. 交卷后把 answerRevealed 置为 true，右侧答题卡切换为彩色 ExamSheetAnswer；
 *   2. 通过 getExamineeQuestionCheckPage 读取参考答案/解析/评分，支持“查看错题”；
 *   3. submitted 状态按考试会话/路由重置，解决返回登录再进考试后确认提交无反应。
 */
(function () {
  'use strict';

  if (window.__epseSubmitResult) return;

  var API_BASE = '/api-electron';
  var LOG = '[EPSE-RESULT]';
  var submitted = false;
  var submittedKey = '';
  var running = false;
  var lastPath = String((window.location.pathname || '') + (window.location.hash || ''));

  function currentLocationText() {
    return String((window.location.pathname || '') + (window.location.hash || ''));
  }

  function isExamPage() {
    return currentLocationText().indexOf('/electronicExam') >= 0;
  }

  function log() {
    try {
      console.log.apply(console, [LOG].concat(Array.prototype.slice.call(arguments)));
    } catch (e) { /* ignore */ }
  }

  function warn() {
    try {
      console.warn.apply(console, [LOG].concat(Array.prototype.slice.call(arguments)));
    } catch (e) { /* ignore */ }
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function toNumber(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function escapeHtml(value) {
    return String(value == null ? '—' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function json(value) {
    try { return JSON.stringify(value); } catch (e) { return String(value); }
  }

  function requestHeaders(token) {
    return {
      'Content-Type': 'application/json',
      token: token || '',
      language: (localStorage.getItem('language') === 'English' ? 'en_US' : 'zh_CN')
    };
  }

  async function request(path, options) {
    var opts = options || {};
    var init = {
      method: opts.method || 'GET',
      headers: requestHeaders(opts.token)
    };
    if (opts.body !== undefined) {
      init.body = JSON.stringify(opts.body);
    }

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    if (controller) {
      init.signal = controller.signal;
      timer = setTimeout(function () { controller.abort(); }, 10000);
    }

    try {
      var response = await fetch(API_BASE + path, init);
      var text = await response.text();
      var body = null;
      if (text) {
        try { body = JSON.parse(text); } catch (e) { body = text; }
      }
      return { status: response.status, body: body };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function unwrap(result) {
    if (!result) return null;
    var body = result.body;
    if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'data')) {
      return body.data;
    }
    return body;
  }

  function isOk(result) {
    if (!result || result.status < 200 || result.status >= 300) return false;
    var body = result.body;
    if (body && typeof body === 'object' && body.code !== undefined && body.code !== null) {
      return Number(body.code) === 200;
    }
    return true;
  }

  function ensureStyle() {
    if (document.getElementById('epse-result-style')) return;
    var style = document.createElement('style');
    style.id = 'epse-result-style';
    style.textContent = [
      '#epse-result-banner{position:fixed;right:24px;bottom:24px;z-index:99999;width:360px;box-sizing:border-box;',
      'padding:18px 20px 16px;border-radius:12px;background:#fff;border-top:5px solid #16a34a;',
      'box-shadow:0 14px 42px rgba(15,23,42,.28);font-family:"Microsoft YaHei",Arial,sans-serif;color:#1f2937;',
      'line-height:1.5;}',
      '#epse-result-banner .epse-r-head{display:flex;align-items:center;justify-content:space-between;gap:8px;',
      'cursor:move;user-select:none;touch-action:none;margin:-6px -4px 0;padding:6px 4px 4px;}',
      '#epse-result-banner .epse-r-head:active{cursor:grabbing;}',
      '#epse-result-banner.dragging{opacity:.96;box-shadow:0 18px 50px rgba(15,23,42,.35);}',
      '#epse-result-banner .epse-r-ok{font-size:18px;font-weight:700;color:#15803d;}',
      '#epse-result-banner .epse-r-tip{font-size:12px;color:#6b7280;}',
      '#epse-result-banner .epse-r-score{margin-top:10px;font-size:15px;color:#374151;}',
      '#epse-result-banner .epse-r-score b{font-size:30px;color:#dc2626;margin:0 4px;}',
      '#epse-result-banner .epse-r-score span{font-size:14px;color:#6b7280;}',
      '#epse-result-banner .epse-r-meta{margin-top:6px;font-size:13px;color:#4b5563;}',
      '#epse-result-banner .epse-r-actions{margin-top:14px;display:flex;gap:10px;}',
      '#epse-result-banner button{flex:1;height:38px;border:0;border-radius:8px;background:#2563eb;color:#fff;',
      'font-size:14px;cursor:pointer;}',
      '#epse-result-banner button:hover{background:#1d4ed8;}',
      '#epse-result-banner button.epse-r-secondary{background:#f59e0b;}',
      '#epse-result-banner button.epse-r-secondary:hover{background:#d97706;}',
      '#epse-result-banner button:disabled{background:#93c5fd;cursor:default;}',
      '#epse-result-banner .epse-r-note{margin-top:10px;font-size:12px;color:#9ca3af;}',
      'body.epse-submitted .exam-header-time{display:none!important;}',
      'body.epse-submitted .exam-header .el-button--danger{display:none!important;}',
      'body.epse-submitted .exam-info-contain input,',
      'body.epse-submitted .exam-info-contain textarea,',
      'body.epse-submitted .exam-info-contain .el-radio,',
      'body.epse-submitted .exam-info-contain .el-checkbox,',
      'body.epse-submitted .exam-info-contain .el-button,',
      'body.epse-submitted .exam-info-contain button{pointer-events:none!important;}',
      // 交卷后 isViewAnswer=true 会触发原生 .viewAnswer:after 遮罩，连“操作台”
      // 的滚动条一起挡住。这里去掉遮罩，改为只禁用内容点击，但保留
      // .operate-area-container 的滚动条（可拖动/滚轮）。
      'body.epse-submitted .viewAnswer:after{display:none!important;}',
      'body.epse-submitted .viewAnswer *{pointer-events:none!important;}',
      'body.epse-submitted .viewAnswer .operate-area-container,',
      'body.epse-submitted .viewAnswer .operation-draw{pointer-events:auto!important;}'
    ].join('');
    document.head.appendChild(style);
  }

  function removeBanner() {
    var old = document.getElementById('epse-result-banner');
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  function clearSubmittedClass() {
    try { document.body.classList.remove('epse-submitted'); } catch (e) { /* ignore */ }
  }

  function resetSubmissionState(reason) {
    var hadBanner = !!document.getElementById('epse-result-banner');
    removeBanner();
    clearSubmittedClass();
    submitted = false;
    submittedKey = '';
    running = false;
    log('重置交卷状态', json({ reason: reason || '', hadBanner: hadBanner }));
  }

  function sessionKey(context) {
    var progress = (context && context.progress) || {};
    var examInfo = (context && context.examInfo) || {};
    return [
      progress.examineeCode || '',
      examInfo.examId || '',
      progress.examPaperCode || progress.paperCode || examInfo.examPaperCode || ''
    ].join('|');
  }

  function watchPath() {
    var locationText = currentLocationText();
    if (locationText === lastPath) return;
    lastPath = locationText;

    if (locationText.indexOf('/electronicExam') === -1) {
      // 回到登录页/其他页面：允许下一次考试重新交卷
      if (submitted || running || document.getElementById('epse-result-banner')) {
        resetSubmissionState('leave-exam');
      }
    } else if (submitted && !document.getElementById('epse-result-banner')) {
      // 再次进入考试页，但上一次的结果卡片已不在
      resetSubmissionState('re-enter-exam');
    }
  }

  function showDomLoading() {
    if (document.getElementById('epse-submit-loading')) return null;
    var box = document.createElement('div');
    box.id = 'epse-submit-loading';
    box.textContent = '正在计算成绩，请稍候…';
    box.style.cssText = [
      'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%,-50%)',
      'z-index:100000', 'background:#fff', 'padding:18px 26px', 'border-radius:10px',
      'box-shadow:0 12px 40px rgba(15,23,42,.25)', 'font:14px "Microsoft YaHei",Arial,sans-serif',
      'color:#1f2937'
    ].join(';');
    document.body.appendChild(box);
    return box;
  }

  function hideDomLoading(box) {
    if (box && box.parentNode) box.parentNode.removeChild(box);
  }

  function makeDraggable(box) {
    var handle = box.querySelector('.epse-r-head');
    if (!handle) return;

    var dragging = false;
    var startX = 0;
    var startY = 0;
    var startLeft = 0;
    var startTop = 0;

    handle.setAttribute('title', '按住标题拖动');

    handle.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      var rect = box.getBoundingClientRect();

      // 从 right/bottom 定位切换为 left/top，避免拖动开始时跳一下。
      box.style.left = rect.left + 'px';
      box.style.top = rect.top + 'px';
      box.style.right = 'auto';
      box.style.bottom = 'auto';

      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      box.classList.add('dragging');

      try { handle.setPointerCapture(event.pointerId); } catch (e) { /* ignore */ }
      event.preventDefault();
      event.stopPropagation();
    });

    handle.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      var rect = box.getBoundingClientRect();
      var maxLeft = Math.max(0, window.innerWidth - rect.width);
      var maxTop = Math.max(0, window.innerHeight - rect.height);
      var left = Math.min(Math.max(0, startLeft + (event.clientX - startX)), maxLeft);
      var top = Math.min(Math.max(0, startTop + (event.clientY - startY)), maxTop);

      box.style.left = left + 'px';
      box.style.top = top + 'px';
      event.preventDefault();
    });

    function endDrag(event) {
      if (!dragging) return;
      dragging = false;
      box.classList.remove('dragging');
      try { handle.releasePointerCapture(event.pointerId); } catch (e) { /* ignore */ }
    }

    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
  }

  function showResult(data, handlers) {
    ensureStyle();
    document.body.classList.add('epse-submitted');
    removeBanner();

    var actions = '';
    if (data.reviewable) {
      actions += '<button type="button" id="epse-result-review" class="epse-r-secondary">' +
        escapeHtml(data.reviewLabel || '查看答题卡') + '</button>';
    }
    actions += '<button type="button" id="epse-result-exit">返回登录</button>';

    var box = document.createElement('div');
    box.id = 'epse-result-banner';
    box.setAttribute('role', 'status');
    box.innerHTML = [
      '<div class="epse-r-head"><span class="epse-r-ok">✓ 交卷成功</span>',
      '<span class="epse-r-tip">按住标题拖动 · 本次作答已提交</span></div>',
      '<div class="epse-r-score">得分 <b>', escapeHtml(data.total), '</b>',
      '<span>/ ', escapeHtml(data.max), '</span></div>',
      '<div class="epse-r-meta">已答 ', escapeHtml(data.answered), ' 题 · 正确 ',
      escapeHtml(data.correct), ' · 错误 ', escapeHtml(data.wrong),
      (data.partial ? ' · 部分得分 ' + escapeHtml(data.partial) : ''),
      (data.pending ? ' · 待判 ' + escapeHtml(data.pending) : ''), '</div>',
      '<div class="epse-r-actions">', actions, '</div>',
      '<div class="epse-r-note">',
      (data.answerWarning
        ? '参考答案接口未返回，当前只能查看题目、你的答案和对错；请把 ui-actions.log 发回排查。'
        : '答题卡已切换为彩色：绿色正确、红色错误、黄色部分得分。点击彩色题号可查看题目、你的答案和参考答案；关闭窗口也会结束本次练习。'),
      '</div>'
    ].join('');
    document.body.appendChild(box);
    makeDraggable(box);

    var reviewButton = box.querySelector('#epse-result-review');
    if (reviewButton && handlers && typeof handlers.onReview === 'function') {
      reviewButton.addEventListener('click', function () {
        try {
          handlers.onReview();
        } catch (e) {
          warn('查看错题失败', e);
        }
      });
    }

    var exitButton = box.querySelector('#epse-result-exit');
    exitButton.addEventListener('click', function () {
      if (exitButton.disabled) return;
      exitButton.disabled = true;
      exitButton.textContent = '正在返回…';
      Promise.resolve(handlers && handlers.onExit ? handlers.onExit() : false).then(function (ok) {
        if (!ok) {
          exitButton.disabled = false;
          exitButton.textContent = '返回登录';
        }
      }).catch(function () {
        exitButton.disabled = false;
        exitButton.textContent = '返回登录';
      });
    });
  }

  function normalizeReviewRow(item) {
    if (!item) return null;
    var eq = item.eq || {};
    var question = item.question || {};
    var questionCode = String(
      item.questionCode || question.code || eq.questionCode || ''
    );
    if (!questionCode) return null;

    return {
      questionCode: questionCode,
      examineeCode: item.examineeCode || eq.examineeCode || '',
      resultScore: item.resultScore !== undefined ? item.resultScore : eq.resultScore,
      questionScore: item.questionScore !== undefined ? item.questionScore : eq.questionScore,
      isAnswer: item.isAnswer !== undefined ? item.isAnswer : eq.isAnswer,
      answerResult: item.answerResult !== undefined ? item.answerResult : eq.answerResult,
      answer: item.answer !== undefined ? item.answer : question.answer,
      answerImage: item.questionAnswerImage !== undefined
        ? item.questionAnswerImage
        : (item.answerImage !== undefined ? item.answerImage : question.answerImage),
      analysis: item.analysis !== undefined ? item.analysis : question.analysis
    };
  }

  async function fetchCheckPage(token, examineeCode, examId) {
    var all = [];
    var page = 1;
    var pages = 1;

    do {
      var query = '?pageNum=' + page + '&pageSize=500' +
        '&examineeCode=' + encodeURIComponent(examineeCode || '');
      if (examId) query += '&examId=' + encodeURIComponent(examId);

      var response = await request('/examineeQuestion/getExamineeQuestionCheckPage' + query, { token: token });
      if (!isOk(response)) {
        return { ok: false, status: response.status, rows: all };
      }

      var data = unwrap(response) || {};
      var list = Array.isArray(data) ? data : (data.list || data.rows || []);
      if (!Array.isArray(list)) list = [];
      all = all.concat(list);

      var totalPages = Number(data.pages || 0);
      if (totalPages > 0) pages = totalPages;
      if (!list.length || page >= pages || page >= 5) break;
      page += 1;
    } while (true);

    var rows = all.map(normalizeReviewRow).filter(Boolean).filter(function (row) {
      return !examineeCode || !row.examineeCode || String(row.examineeCode) === String(examineeCode);
    });
    return { ok: true, rows: rows };
  }

  async function fetchEqWithQuestionList(token, examineeCode, examPaperCode) {
    var response = await request('/examineeQuestion/eqWithQuestionList', {
      method: 'POST',
      token: token,
      body: {
        examineeCode: examineeCode,
        examPaperCode: examPaperCode,
        withAnswer: 2
      }
    });
    if (!isOk(response)) {
      return { ok: false, status: response.status, rows: [] };
    }
    var data = unwrap(response);
    var list = Array.isArray(data) ? data : (data && Array.isArray(data.rows) ? data.rows : []);
    return { ok: true, rows: list.map(normalizeReviewRow).filter(Boolean) };
  }

  async function readReviewData(token, examineeCode, examId, examPaperCode) {
    var rows = [];
    var source = 'none';
    var lastScoredCount = -1;
    var stableRounds = 0;
    var failedRounds = 0;

    // saveBatchExamAnswer 的判分是异步线程，轮询到“已答题都有 resultScore”再取总分。
    for (var i = 0; i < 40; i += 1) {
      try {
        var primary = await fetchCheckPage(token, examineeCode, examId);
        if (primary.ok && primary.rows.length) {
          rows = primary.rows;
          source = 'getExamineeQuestionCheckPage';
        } else {
          var fallback = await fetchEqWithQuestionList(token, examineeCode, examPaperCode);
          if (fallback.ok && fallback.rows.length) {
            rows = fallback.rows;
            source = 'eqWithQuestionList';
          } else if (primary.ok && primary.rows.length) {
            rows = primary.rows;
            source = 'getExamineeQuestionCheckPage';
          }
        }
        failedRounds = 0;

        if (rows.length) {
          var answered = rows.filter(function (row) { return Number(row.isAnswer) === 1; });
          if (!answered.length) break;

          var scoredCount = answered.filter(function (row) {
            return row.resultScore !== null && row.resultScore !== undefined;
          }).length;
          var unscored = answered.length - scoredCount;
          if (!unscored) break;

          // 判分线程还在跑：分数连续 3 秒没有增长时也结束等待，避免卡死。
          if (scoredCount === lastScoredCount) stableRounds += 1;
          else { lastScoredCount = scoredCount; stableRounds = 0; }
          if (scoredCount > 0 && stableRounds >= 6) break;
        }
      } catch (e) {
        failedRounds += 1;
        warn('读取复核数据失败', e);
        if (failedRounds >= 3) break;
      }
      await sleep(500);
    }

    // 主接口完全没数据时再兜底一次
    if (!rows.length) {
      try {
        var finalFallback = await fetchEqWithQuestionList(token, examineeCode, examPaperCode);
        if (finalFallback.ok && finalFallback.rows.length) {
          rows = finalFallback.rows;
          source = 'eqWithQuestionList';
        }
      } catch (e) {
        warn('兜底读取 eqWithQuestionList 失败', e);
      }
    }

    var withAnswer = rows.filter(function (row) {
      return row.answer !== null && row.answer !== undefined && row.answer !== '';
    }).length;
    log('复核数据', json({
      source: source,
      rows: rows.length,
      withAnswer: withAnswer,
      answered: rows.filter(function (row) { return Number(row.isAnswer) === 1; }).length,
      scored: rows.filter(function (row) {
        return Number(row.isAnswer) === 1 && row.resultScore !== null && row.resultScore !== undefined;
      }).length
    }));

    return { rows: rows, source: source };
  }

  async function readTotalScore(token, examineeCode) {
    try {
      var response = await request(
        '/examineeQuestion/getTotalScore?examineeCode=' + encodeURIComponent(examineeCode || ''),
        { token: token }
      );
      if (isOk(response)) {
        var value = Number(unwrap(response));
        if (isFinite(value)) return value;
      }
    } catch (e) {
      warn('getTotalScore 读取失败', e);
    }
    return null;
  }

  function mergeReviewData(store, rows) {
    var reviewMap = {};
    (rows || []).forEach(function (row) {
      if (row && row.questionCode) reviewMap[row.questionCode] = row;
    });

    var stats = { max: 0, answered: 0, correct: 0, wrong: 0, partial: 0 };
    var firstWrong = null;
    var firstAnswered = null;
    var mergedAnswerCount = 0;
    var groups = (store.state.paperInfo && store.state.paperInfo.examineeQuestion) || [];

    var next = groups.map(function (group) {
      return Object.assign({}, group, {
        list: (group.list || []).map(function (item) {
          var eq = Object.assign({}, item.eq || {});
          var question = Object.assign({}, item.question || {});
          var code = String((item.question && item.question.code) || eq.questionCode || '');
          var review = reviewMap[code];
          var questionScore = toNumber(
            review && review.questionScore != null ? review.questionScore : eq.questionScore,
            0
          );

          if (review) {
            if (review.resultScore !== undefined) eq.resultScore = review.resultScore;
            if (review.answerResult !== undefined) eq.answerResult = review.answerResult;
            if (review.isAnswer !== undefined) eq.isAnswer = review.isAnswer;
            if (review.answer !== undefined && review.answer !== null && review.answer !== '') {
              question.answer = review.answer;
              mergedAnswerCount += 1;
            }
            if (review.answerImage !== undefined && review.answerImage !== null) {
              question.answerImage = review.answerImage;
            }
            if (review.analysis !== undefined && review.analysis !== null) {
              question.analysis = review.analysis;
            }
          }
          eq.questionScore = questionScore;

          stats.max += questionScore;
          if (Number(eq.isAnswer) === 1) {
            stats.answered += 1;
            if (!firstAnswered) firstAnswered = item;
            // resultScore 为 null 表示主观题尚未判分，不计入对/错。
            if (eq.resultScore !== null && eq.resultScore !== undefined) {
              var resultScore = toNumber(eq.resultScore, 0);
              if (questionScore > 0 && resultScore >= questionScore) {
                stats.correct += 1;
              } else if (resultScore > 0) {
                stats.partial += 1;
              } else {
                stats.wrong += 1;
              }
              if (questionScore > 0 && resultScore < questionScore && !firstWrong) {
                firstWrong = item;
              }
            }
          }

          return Object.assign({}, item, { question: question, eq: eq });
        })
      });
    });

    store.commit('setPaperInfo', {
      examineeQuestion: next,
      answerRevealed: rows && rows.length > 0
    });

    return {
      stats: stats,
      firstWrong: firstWrong,
      firstAnswered: firstAnswered,
      mergedAnswerCount: mergedAnswerCount
    };
  }

  async function exitToLogin(context) {
    var progress = context.progress || {};
    var payload = {
      identityCardId: progress.identityCardId,
      admissionCardId: progress.admissionCardId,
      examProgress: 3,
      examineeCode: progress.examineeCode
    };
    log('准备提交交卷状态 updateExam', json(payload));

    try {
      var response = await request('/examineeProgress/updateExam', {
        method: 'POST',
        token: (context.store && context.store.state && context.store.state.token) || '',
        body: payload
      });
      log('updateExam 返回', response.status, json(response.body));
      if (!isOk(response)) {
        if (context.proxy && context.proxy.$message) {
          context.proxy.$message.error('交卷记录保存失败，请重试');
        }
        return false;
      }
    } catch (e) {
      warn('updateExam 请求失败', e);
      if (context.proxy && context.proxy.$message) {
        context.proxy.$message.error('交卷记录保存失败，请检查后台服务');
      }
      return false;
    }

    try {
      removeBanner();
      if (typeof context.finalize === 'function') {
        context.finalize();
        // finalize 内部延迟 500ms 才跳登录；等跳转后再移除样式，避免闪一下红按钮。
        setTimeout(function () {
          clearSubmittedClass();
          submitted = false;
          submittedKey = '';
        }, 1200);
      } else {
        clearSubmittedClass();
        submitted = false;
        submittedKey = '';
        context.store.commit('clearData');
        window.location.href = '/#/login';
      }
    } catch (e) {
      clearSubmittedClass();
      submitted = false;
      submittedKey = '';
      window.location.href = '/#/login';
    }
    return true;
  }

  window.__epseSubmitResult = async function (context) {
    var key = sessionKey(context);
    var hasBanner = !!document.getElementById('epse-result-banner');

    // 上一次交卷的结果卡片已经不在，或者已经换了一场考试：允许重新交卷。
    if (submitted && (!hasBanner || key !== submittedKey)) {
      resetSubmissionState('new-session-or-banner-gone');
    }

    if (running || submitted) {
      log('忽略重复交卷请求', json({
        running: running,
        submitted: submitted,
        hasBanner: hasBanner,
        currentKey: key,
        submittedKey: submittedKey
      }));
      return;
    }
    running = true;

    var store = context.store;
    var progress = context.progress || {};
    var examInfo = context.examInfo || {};
    var token = (store && store.state && store.state.token) || '';
    var examineeCode = progress.examineeCode || '';
    var examId = examInfo.examId || '';
    var examPaperCode = progress.examPaperCode || progress.paperCode || examInfo.examPaperCode || '';

    log('开始处理交卷', json({
      examineeCode: examineeCode,
      examPaperCode: examPaperCode,
      examId: examId,
      examCategory: examInfo.examCategory,
      payloadCount: Array.isArray(context.payload) ? context.payload.length : 0
    }));

    if (typeof context.closePaper === 'function') {
      try { context.closePaper(); } catch (e) { /* ignore */ }
    }

    var loading = null;
    var loadingDom = null;
    try {
      if (context.proxy && typeof context.proxy.$loading === 'function') {
        loading = context.proxy.$loading({
          lock: true,
          text: '正在计算成绩，请稍候…',
          background: 'rgba(0, 0, 0, 0.15)'
        });
      }
    } catch (e) { /* ignore */ }
    if (!loading) loadingDom = showDomLoading();

    try {
      var review = await readReviewData(token, examineeCode, examId, examPaperCode);

      // 极端情况下（红按钮那次批量保存失败），再补一次批量保存后重读。
      if (!review.rows.length && Array.isArray(context.payload) && context.payload.length) {
        log('未读到题目数据，补调 saveBatchExamAnswer');
        var retrySave = await request('/examineeQuestion/saveBatchExamAnswer', {
          method: 'POST',
          token: token,
          body: context.payload
        });
        log('补调 saveBatchExamAnswer 返回', retrySave.status, json(retrySave.body));
        review = await readReviewData(token, examineeCode, examId, examPaperCode);
      }

      var merged = mergeReviewData(store, review.rows);
      var stats = merged.stats;

      if (!stats.max) {
        var groups = (store.state.paperInfo && store.state.paperInfo.examineeQuestion) || [];
        groups.forEach(function (group) {
          (group.list || []).forEach(function (item) {
            stats.max += toNumber(item.eq && item.eq.questionScore, 0);
          });
        });
      }

      var total = await readTotalScore(token, examineeCode);
      var sumScore = 0;
      var allGroups = (store.state.paperInfo && store.state.paperInfo.examineeQuestion) || [];
      allGroups.forEach(function (group) {
        (group.list || []).forEach(function (item) {
          sumScore += toNumber(item.eq && item.eq.resultScore, 0);
        });
      });
      // 后端总分偶尔会在异步判分未完全结束时偏小，取两者较大值兜底。
      if (total == null || total < sumScore) total = sumScore;

      var result = {
        total: Math.round(toNumber(total, 0) * 100) / 100,
        max: Math.round(toNumber(stats.max, 0) * 100) / 100,
        answered: stats.answered,
        correct: stats.correct,
        wrong: stats.wrong,
        partial: stats.partial,
        pending: Math.max(0, stats.answered - stats.correct - stats.wrong - stats.partial),
        reviewable: !!(merged.firstWrong || merged.firstAnswered),
        reviewLabel: merged.firstWrong ? '查看错题' : '查看答题卡',
        answerWarning: merged.mergedAnswerCount === 0
      };

      log('交卷结果', json(result));
      log('复核合并', json({
        mergedAnswerCount: merged.mergedAnswerCount,
        firstWrong: merged.firstWrong ? merged.firstWrong.question.code : '',
        firstAnswered: merged.firstAnswered ? merged.firstAnswered.question.code : ''
      }));

      if (!isExamPage()) {
        log('页面已离开考试页，放弃显示结果');
        return;
      }

      // 阻止隐藏的倒计时继续触发自动交卷。
      try { store.commit('setExamTime', Date.now() + 31536000000); } catch (e) { /* ignore */ }

      if (typeof context.closePaper === 'function') {
        try { context.closePaper(); } catch (e) { /* ignore */ }
      }

      var target = merged.firstWrong || merged.firstAnswered;
      showResult(result, {
        onExit: function () { return exitToLogin(context); },
        onReview: function () {
          if (!target) return;
          var code = target.question && target.question.code;
          if (code) {
            store.commit('setExamActiveCode', code);
            log('查看复核题目', json({ code: code, isWrong: target === merged.firstWrong }));
            setTimeout(function () {
              try {
                // 优先把“参考答案”面板滚到可见区域，避免用户以为没有答案。
                var headers = document.querySelectorAll('.exam-info-header');
                for (var i = 0; i < headers.length; i += 1) {
                  if (String(headers[i].textContent || '').indexOf('参考答案') >= 0) {
                    if (headers[i].scrollIntoView) {
                      headers[i].scrollIntoView({ block: 'center', behavior: 'smooth' });
                    }
                    return;
                  }
                }
                var wrap = document.querySelector('.exam-info-contain .el-scrollbar__wrap');
                if (wrap && wrap.scrollTo) wrap.scrollTo({ top: 0, behavior: 'smooth' });
              } catch (e) { /* ignore */ }
            }, 350);
          }
        }
      });

      submitted = true;
      submittedKey = key;
    } catch (e) {
      warn('读取交卷结果失败，显示兜底提示', e);
      if (context.proxy && context.proxy.$message) {
        context.proxy.$message.error('交卷结果读取失败，但本次作答已提交，可点击“返回登录”结束本次练习');
      }
      showResult(
        {
          total: '—',
          max: '—',
          answered: 0,
          correct: 0,
          wrong: 0,
          partial: 0,
          pending: 0,
          reviewable: false,
          reviewLabel: '查看答题卡',
          answerWarning: true
        },
        { onExit: function () { return exitToLogin(context); } }
      );
      submitted = true;
      submittedKey = key;
    } finally {
      if (loading) {
        try { loading.close(); } catch (e) { /* ignore */ }
      }
      hideDomLoading(loadingDom);
      running = false;
    }
  };

  setInterval(watchPath, 500);
  window.addEventListener('popstate', watchPath);
  window.addEventListener('hashchange', watchPath);

  try { console.log('[EPSE-RESULT] helper loaded v2'); } catch (e) { /* ignore */ }
})();
