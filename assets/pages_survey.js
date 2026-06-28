(function () {
  const config = window.SURVEY_PAGES_CONFIG || {};
  const apiBaseUrl = String(config.apiBaseUrl || "").replace(/\/$/, "");
  const urlParams = new URLSearchParams(window.location.search);
  const surveySlug = urlParams.get("survey") || config.defaultSurveySlug || "";

  const identifyPanel = document.querySelector("[data-identify-panel]");
  const identifyForm = document.querySelector("[data-identify-form]");
  const identifyError = document.querySelector("[data-identify-error]");
  const surveyTitle = document.querySelector("[data-survey-title]");
  const heroCopy = document.querySelector("[data-hero-copy]");
  const progressPanel = document.querySelector("[data-progress-panel]");
  const questionNav = document.querySelector("[data-question-nav]");
  const form = document.querySelector("[data-survey-wizard]");
  const thanksPanel = document.querySelector("[data-thanks-panel]");
  const thanksCopy = document.querySelector("[data-thanks-copy]");
  const progressText = document.getElementById("wizardProgress");
  const filledText = document.getElementById("wizardFilled");
  const bar = document.getElementById("wizardBar");
  const message = document.getElementById("wizardMessage");
  const prevButton = document.getElementById("wizardPrev");
  const nextButton = document.getElementById("wizardNext");
  const submitButton = document.getElementById("wizardSubmit");

  let participant = null;
  let submitToken = "";
  let questions = [];
  let steps = [];
  let textareas = [];
  let navButtons = [];
  let index = 0;
  let storageKey = "";
  const visited = new Set([0]);

  function setError(text) {
    if (!identifyError) return;
    identifyError.textContent = text || "";
    identifyError.hidden = !text;
  }

  function setMessage(text, tone) {
    if (!message) return;
    message.textContent = text || "";
    message.hidden = !text;
    message.classList.toggle("warn", tone === "warn");
    message.classList.toggle("ok", tone === "ok");
    message.classList.toggle("error", tone === "error");
  }

  function setBusy(button, busyText) {
    if (!button) return function noop() {};
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
    return function restore() {
      button.disabled = false;
      button.textContent = originalText;
    };
  }

  async function postJson(path, payload) {
    const response = await fetch(apiBaseUrl + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "请求失败，请稍后重试。");
    }
    return data;
  }

  function readDraft() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch (_error) {
      return {};
    }
  }

  function saveDraft() {
    const draft = {};
    textareas.forEach((textarea) => {
      draft[textarea.name] = textarea.value;
    });
    localStorage.setItem(storageKey, JSON.stringify(draft));
  }

  function restoreDraft() {
    const draft = readDraft();
    textareas.forEach((textarea) => {
      if (!textarea.value && draft[textarea.name]) {
        textarea.value = draft[textarea.name];
      }
    });
  }

  function filledCount() {
    return textareas.filter((textarea) => textarea.value.trim()).length;
  }

  function emptyVisitedCount() {
    return textareas.filter((textarea, textareaIndex) => visited.has(textareaIndex) && !textarea.value.trim()).length;
  }

  function updateProgress() {
    const answered = filledCount();
    const emptyVisited = emptyVisitedCount();
    if (progressText) progressText.textContent = `第 ${index + 1} / ${steps.length} 题`;
    if (filledText) filledText.textContent = `${answered} / ${steps.length} 已填写`;
    if (bar) bar.style.width = `${Math.round((answered / Math.max(steps.length, 1)) * 100)}%`;

    navButtons.forEach((button, buttonIndex) => {
      const filled = Boolean(textareas[buttonIndex]?.value.trim());
      const isVisited = visited.has(buttonIndex);
      button.classList.toggle("active", buttonIndex === index);
      button.classList.toggle("filled", filled);
      button.classList.toggle("empty-visited", isVisited && !filled);
    });

    if (emptyVisited > 0) {
      setMessage(`还有 ${emptyVisited} 道打开过但未填写的题，可以先留空，也可以点上方橘色题号补充。`, "warn");
    } else if (answered > 0) {
      setMessage("已填写的题会显示为绿色。", "ok");
    } else {
      setMessage("");
    }
  }

  function showStep(nextIndex) {
    index = Math.max(0, Math.min(nextIndex, steps.length - 1));
    visited.add(index);
    steps.forEach((step, stepIndex) => {
      step.classList.toggle("active", stepIndex === index);
    });
    if (prevButton) prevButton.disabled = index === 0;
    if (nextButton) nextButton.hidden = index === steps.length - 1;
    if (submitButton) submitButton.hidden = index !== steps.length - 1;
    updateProgress();
  }

  function questionId(question) {
    return "answer_" + question.id;
  }

  function escapeText(text) {
    return String(text || "").replace(/[&<>"']/g, (char) => {
      const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
      return entities[char];
    });
  }

  function renderQuestions() {
    questionNav.innerHTML = "";
    form.querySelectorAll(".question-step").forEach((node) => node.remove());
    const footer = form.querySelector(".wizard-footer");

    questions.forEach((question, questionIndex) => {
      const navButton = document.createElement("button");
      navButton.type = "button";
      navButton.dataset.jump = String(questionIndex);
      navButton.setAttribute("aria-label", `跳到第${question.number}题`);
      navButton.textContent = question.number;
      questionNav.appendChild(navButton);

      const section = document.createElement("section");
      section.className = "card stack question-step";
      section.dataset.step = String(questionIndex);
      section.dataset.number = String(question.number);
      section.innerHTML = `
        <div class="question-kicker">Question ${escapeText(question.number)}</div>
        <label class="question-label" for="${questionId(question)}">
          <span class="question-number">Q${escapeText(question.number)}</span>
          <span>${escapeText(question.prompt).replace(/\n/g, "<br>")}</span>
        </label>
        <textarea id="${questionId(question)}" name="${questionId(question)}" data-question-id="${escapeText(question.id)}" placeholder="在这里填写回答。暂时不想写也可以先跳到下一题。">${escapeText(question.answer)}</textarea>
      `;
      form.insertBefore(section, footer);
    });

    steps = Array.from(form.querySelectorAll(".question-step"));
    textareas = steps.map((step) => step.querySelector("textarea"));
    navButtons = Array.from(questionNav.querySelectorAll("button"));
    storageKey = "survey-pages-draft:" + surveySlug + ":" + participant.id;
    restoreDraft();

    textareas.forEach((textarea) => {
      textarea.addEventListener("input", () => {
        saveDraft();
        updateProgress();
      });
      textarea.addEventListener("blur", updateProgress);
    });
    navButtons.forEach((button) => {
      button.addEventListener("click", () => {
        showStep(Number(button.dataset.jump));
      });
    });

    if (progressPanel) progressPanel.hidden = false;
    form.hidden = false;
    showStep(0);
  }

  function openSurvey(data) {
    participant = data.participant;
    submitToken = data.submit_token;
    questions = data.questions || [];
    if (data.survey?.title && surveyTitle) surveyTitle.textContent = data.survey.title;
    if (heroCopy) heroCopy.textContent = `${participant.name}，一次只看一道题。可以先跳过，最后通过题号颜色检查哪些已经填写、哪些还空着。`;
    identifyPanel.hidden = true;
    renderQuestions();
  }

  async function identify(event) {
    event.preventDefault();
    setError("");
    if (!apiBaseUrl || !surveySlug) {
      setError("问卷链接配置不完整，请联系发放人。");
      return;
    }
    const name = new FormData(identifyForm).get("name");
    const restore = setBusy(identifyForm.querySelector("button[type='submit']"), "打开中...");
    try {
      const data = await postJson(`/api/public/surveys/${encodeURIComponent(surveySlug)}/identify`, { name });
      openSurvey(data);
    } catch (error) {
      setError(error.message);
    } finally {
      restore();
    }
  }

  async function submitAnswers(event) {
    event.preventDefault();
    setMessage("");
    const answers = {};
    textareas.forEach((textarea) => {
      answers[textarea.dataset.questionId] = textarea.value;
    });
    const restore = setBusy(submitButton, "提交中...");
    try {
      await postJson(`/api/public/surveys/${encodeURIComponent(surveySlug)}/submit`, {
        submit_token: submitToken,
        answers,
      });
      localStorage.removeItem(storageKey);
      form.hidden = true;
      progressPanel.hidden = true;
      message.hidden = true;
      if (thanksCopy) thanksCopy.textContent = `${participant.name}，你的问卷已提交。`;
      thanksPanel.hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      restore();
    }
  }

  prevButton?.addEventListener("click", () => showStep(index - 1));
  nextButton?.addEventListener("click", () => showStep(index + 1));
  identifyForm?.addEventListener("submit", identify);
  form?.addEventListener("submit", submitAnswers);

  if (!surveySlug) {
    setError("缺少问卷编号，请使用发放人提供的完整链接。");
  }
})();
