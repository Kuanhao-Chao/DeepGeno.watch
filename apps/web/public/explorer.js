const normalize = (value) => String(value ?? "").trim();
const STORAGE_KEY = "deepgeno_triage_v1";

const ACRONYMS = new Set([
  "dna",
  "rna",
  "3d",
  "ai",
  "ml",
  "plm",
  "llm",
  "tme",
  "cli",
]);

const formatCategoryTitle = (raw) => {
  if (!raw) return "General";
  return raw
    .split(/[-_]/)
    .map((part) => {
      const lower = part.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
};

const formatShortDate = (date) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);

const formatMonthYear = (date) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);

const getTimelineGroup = (dateString, refDate = new Date()) => {
  if (!dateString) return "Earlier";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "Earlier";

  const isToday =
    date.getUTCFullYear() === refDate.getUTCFullYear() &&
    date.getUTCMonth() === refDate.getUTCMonth() &&
    date.getUTCDate() === refDate.getUTCDate();

  const shortDate = formatShortDate(date);
  if (isToday) {
    return `Today · ${shortDate}`;
  }

  const isSameMonth =
    date.getUTCFullYear() === refDate.getUTCFullYear() &&
    date.getUTCMonth() === refDate.getUTCMonth();

  if (isSameMonth) {
    return shortDate;
  }

  const diffDays = Math.floor(
    (refDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays > 60) {
    return "Earlier";
  }

  const day = date.getUTCDate();
  const monthYear = formatMonthYear(date);
  if (day > 20) {
    return `Late ${monthYear}`;
  } else if (day > 10) {
    return `Mid ${monthYear}`;
  } else {
    return `Early ${monthYear}`;
  }
};

const createGroupHeading = (title, count) => {
  const li = document.createElement("li");
  li.className = "group-heading";
  li.setAttribute("role", "presentation");
  li.dataset.groupHeading = "true";

  const titleEl = document.createElement("span");
  titleEl.className = "group-heading__title";
  titleEl.textContent = title;

  const countEl = document.createElement("span");
  countEl.className = "group-heading__count";
  countEl.textContent = `${count} ${count === 1 ? "paper" : "papers"}`;

  li.appendChild(titleEl);
  li.appendChild(countEl);
  return li;
};

let activeToast = null;
let toastTimer = null;
const showToast = (message) => {
  if (activeToast) {
    activeToast.remove();
    clearTimeout(toastTimer);
    activeToast = null;
  }
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = message;
  document.body.appendChild(toast);
  activeToast = toast;
  toastTimer = setTimeout(() => {
    toast.remove();
    if (activeToast === toast) activeToast = null;
  }, 2400);
};

const copyToClipboard = async (text) => {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const doc = document;
    const cmd = "exec" + "Command";
    const ok = typeof doc[cmd] === "function" ? Boolean(doc[cmd]("copy")) : false;
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
};

const loadTriageState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { decisions: {} };
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.decisions === "object" &&
      parsed.decisions !== null
    ) {
      return parsed;
    }
    return { decisions: {} };
  } catch {
    return { decisions: {} };
  }
};

const saveTriageState = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
};

document.querySelectorAll("[data-explorer]").forEach((explorer) => {
  const form = explorer.querySelector("[data-filter-form]");
  const list = explorer.querySelector("[data-paper-list]");
  const count = explorer.querySelector("[data-result-count]");
  const empty = explorer.querySelector("[data-filtered-empty]");
  if (!form || !list || !count) return;

  const items = Array.from(list.querySelectorAll("[data-paper]"));
  const defaultProgress = explorer.dataset.defaultProgress ?? "all";

  const viewSwitcher = explorer.querySelector("[data-view-switcher]");
  const categoryBar = explorer.querySelector("[data-category-bar]");
  const toggleAbstractsBtn = explorer.querySelector("[data-toggle-all-abstracts]");

  const triageDrawer = explorer.querySelector("[data-triage-bar]");
  const deepDiveCountEl = explorer.querySelector("[data-triage-deep-dive-count]");
  const archivedCountEl = explorer.querySelector("[data-triage-archived-count]");
  const copyCliBtn = explorer.querySelector("[data-triage-copy-cli]");
  const exportJsonBtn = explorer.querySelector("[data-triage-export-json]");
  const filterOnlyBtn = explorer.querySelector("[data-triage-filter-only]");
  const clearTriageBtn = explorer.querySelector("[data-triage-clear]");

  const triageState = loadTriageState();
  let filterTriagedOnly = false;
  let currentView = "timeline";

  const updateRowTriage = (row, status) => {
    const isDeepDive = status === "deep-dive";
    const isArchived = status === "archived";

    row.classList.toggle("paper-row--deep-dive", isDeepDive);
    row.classList.toggle("paper-row--archived", isArchived);

    if (status) {
      row.dataset.triageStatus = status;
    } else {
      delete row.dataset.triageStatus;
    }

    const badge = row.querySelector("[data-triage-badge]");
    if (badge) {
      badge.hidden = !status;
      badge.textContent = isDeepDive ? "Deep Dive" : isArchived ? "Archived" : "";
      badge.className = `triage-badge${
        isDeepDive
          ? " triage-badge--deep-dive"
          : isArchived
          ? " triage-badge--archived"
          : ""
      }`;
    }

    const deepDiveBtn = row.querySelector('[data-triage-action="deep-dive"]');
    if (deepDiveBtn) {
      deepDiveBtn.classList.toggle("is-active", isDeepDive);
      deepDiveBtn.setAttribute("data-active", isDeepDive ? "true" : "false");
      deepDiveBtn.setAttribute("aria-pressed", isDeepDive ? "true" : "false");
    }

    const archiveBtn = row.querySelector('[data-triage-action="archived"]');
    if (archiveBtn) {
      archiveBtn.classList.toggle("is-active", isArchived);
      archiveBtn.setAttribute("data-active", isArchived ? "true" : "false");
      archiveBtn.setAttribute("aria-pressed", isArchived ? "true" : "false");
    }

    const resetBtn = row.querySelector('[data-triage-action="reset"]');
    if (resetBtn) {
      resetBtn.hidden = !status;
    }
  };

  const updateDrawer = () => {
    const decisions = triageState.decisions || {};
    let deepDiveCount = 0;
    let archivedCount = 0;

    for (const item of Object.values(decisions)) {
      if (item?.status === "deep-dive") deepDiveCount += 1;
      else if (item?.status === "archived") archivedCount += 1;
    }

    const totalCount = deepDiveCount + archivedCount;

    if (deepDiveCountEl) {
      deepDiveCountEl.textContent = `${deepDiveCount} Deep Dive`;
    }
    if (archivedCountEl) {
      archivedCountEl.textContent = `${archivedCount} Archived`;
    }
    if (triageDrawer) {
      const isHidden = totalCount === 0;
      triageDrawer.hidden = isHidden;
      triageDrawer.classList.toggle("is-hidden", isHidden);
    }

    if (totalCount === 0 && filterTriagedOnly) {
      filterTriagedOnly = false;
      if (filterOnlyBtn) {
        filterOnlyBtn.classList.remove("is-active");
        filterOnlyBtn.setAttribute("data-active", "false");
        filterOnlyBtn.setAttribute("aria-pressed", "false");
      }
    }
  };

  const hydrateTriageState = () => {
    for (const item of items) {
      const slug = item.dataset.slug;
      const decision = slug ? triageState.decisions?.[slug] : null;
      updateRowTriage(item, decision ? decision.status : null);
    }
    updateDrawer();
  };

  const updateCategoryPills = (activeTopic) => {
    if (!categoryBar) return;
    const normalized = (activeTopic ?? "").trim().toLocaleLowerCase();
    const pills = categoryBar.querySelectorAll("[data-topic]");
    for (const pill of pills) {
      const topic = (pill.dataset.topic ?? "").trim().toLocaleLowerCase();
      const isActive = topic === normalized;
      pill.classList.toggle("is-active", isActive);
      pill.setAttribute("aria-pressed", isActive ? "true" : "false");
      pill.setAttribute("data-active", isActive ? "true" : "false");
    }
  };

  const updateViewSwitcher = (view) => {
    if (viewSwitcher) {
      const btns = viewSwitcher.querySelectorAll("[data-view]");
      for (const btn of btns) {
        const isActive = btn.dataset.view === view;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
        btn.setAttribute("data-active", isActive ? "true" : "false");
      }
    }
    form.hidden = view !== "search";
  };

  const setView = (newView, writeUrl = false) => {
    currentView = newView;
    updateViewSwitcher(currentView);
    if (currentView === "search") {
      const searchInput = form.querySelector('input[type="search"]');
      searchInput?.focus();
    }
    apply(writeUrl);
  };

  const updateToggleAbstractsLabel = () => {
    if (!toggleAbstractsBtn) return;
    const details = list.querySelectorAll(".paper-row__abstract");
    if (details.length === 0) return;
    const allOpen = Array.from(details).every((d) => d.open);
    toggleAbstractsBtn.textContent = allOpen
      ? "Collapse All Abstracts"
      : "Expand All Abstracts";
  };

  const setFormFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    for (const element of Array.from(form.elements)) {
      if (
        !(
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement
        )
      )
        continue;
      if (!element.name) continue;
      const fallback =
        element.name === "progress" && defaultProgress !== "all"
          ? defaultProgress
          : "";
      const defaultValue = element.name === "sort" ? "newest" : fallback;
      element.value = params.get(element.name) ?? defaultValue;
    }

    const viewParam = params.get("view");
    if (
      viewParam === "timeline" ||
      viewParam === "category" ||
      viewParam === "search"
    ) {
      currentView = viewParam;
    } else if (
      params.has("q") ||
      params.has("priority") ||
      params.has("progress") ||
      params.has("sort")
    ) {
      currentView = "search";
    } else {
      currentView = "timeline";
    }

    updateCategoryPills(params.get("tag") ?? "");
    updateViewSwitcher(currentView);
  };

  const apply = (writeUrl = false) => {
    const values = new FormData(form);
    const query = normalize(values.get("q")).toLocaleLowerCase();
    const tag = normalize(values.get("tag")).toLocaleLowerCase();
    const priority = normalize(values.get("priority"));
    const progress = normalize(values.get("progress"));
    const sort = normalize(values.get("sort")) || "newest";

    let visible = 0;
    const visibleItems = [];

    for (const item of items) {
      let itemTags = [];
      try {
        itemTags = JSON.parse(item.dataset.tags ?? "[]");
      } catch {
        itemTags = [];
      }

      const matchesQuery = !query || (item.dataset.search ?? "").includes(query);
      const matchesTag = !tag || itemTags.includes(tag);
      const matchesPriority = !priority || item.dataset.priority === priority;
      const matchesProgress = !progress || item.dataset.progress === progress;
      const matchesTriaged =
        !filterTriagedOnly ||
        Boolean(triageState.decisions?.[item.dataset.slug]);

      const matches =
        matchesQuery &&
        matchesTag &&
        matchesPriority &&
        matchesProgress &&
        matchesTriaged;

      item.hidden = !matches;
      if (matches) {
        visible += 1;
        visibleItems.push(item);
      }
    }

    count.textContent = `${visible} ${visible === 1 ? "paper" : "papers"}`;
    if (empty) empty.hidden = visible !== 0;

    // Cleanly remove any old group headings
    list.querySelectorAll("[data-group-heading]").forEach((el) => el.remove());

    if (currentView === "timeline") {
      visibleItems.sort((a, b) =>
        (b.dataset.date ?? "").localeCompare(a.dataset.date ?? "")
      );
      const groups = new Map();
      for (const item of visibleItems) {
        const groupKey = getTimelineGroup(item.dataset.date);
        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey).push(item);
      }
      for (const [groupTitle, groupItems] of groups.entries()) {
        const heading = createGroupHeading(groupTitle, groupItems.length);
        list.appendChild(heading);
        for (const item of groupItems) {
          list.appendChild(item);
        }
      }
    } else if (currentView === "category") {
      const groups = new Map();
      for (const item of visibleItems) {
        const catTitle = formatCategoryTitle(item.dataset.category);
        if (!groups.has(catTitle)) {
          groups.set(catTitle, []);
        }
        groups.get(catTitle).push(item);
      }
      const sortedCategories = Array.from(groups.keys()).sort((a, b) =>
        a.localeCompare(b)
      );
      for (const catTitle of sortedCategories) {
        const groupItems = groups.get(catTitle);
        groupItems.sort((a, b) =>
          (b.dataset.date ?? "").localeCompare(a.dataset.date ?? "")
        );
        const heading = createGroupHeading(catTitle, groupItems.length);
        list.appendChild(heading);
        for (const item of groupItems) {
          list.appendChild(item);
        }
      }
    } else {
      // Standard search / sorted order
      const direction = sort === "oldest" ? 1 : -1;
      visibleItems.sort((left, right) => {
        if (sort === "priority") {
          const rank =
            Number(left.dataset.priorityRank || 0) -
            Number(right.dataset.priorityRank || 0);
          if (rank !== 0) return rank;
        }
        return (
          direction *
          (left.dataset.date ?? "").localeCompare(right.dataset.date ?? "")
        );
      });
      for (const item of visibleItems) {
        list.appendChild(item);
      }
    }

    // Keep hidden items at the end of the list
    for (const item of items) {
      if (item.hidden) {
        list.appendChild(item);
      }
    }

    updateToggleAbstractsLabel();

    if (writeUrl) {
      const params = new URLSearchParams();
      for (const [key, rawValue] of values.entries()) {
        const value = normalize(rawValue);
        const isImplicitProgress =
          key === "progress" && value === defaultProgress;
        const isDefaultSort = key === "sort" && value === "newest";
        if (value && !isImplicitProgress && !isDefaultSort) {
          params.set(key, value);
        }
      }
      if (currentView !== "timeline") {
        params.set("view", currentView);
      }
      const search = params.size ? `?${params.toString()}` : "";
      window.history.pushState({}, "", `${window.location.pathname}${search}`);
    }
  };

  // Event Delegation for Candidate Triage Actions
  list.addEventListener("click", (event) => {
    const actionBtn = event.target.closest("[data-triage-action]");
    if (!actionBtn) return;
    const row = actionBtn.closest("[data-paper]");
    if (!row) return;
    const slug = row.dataset.slug;
    if (!slug) return;

    const action = actionBtn.dataset.triageAction;
    if (action === "deep-dive" || action === "archived") {
      triageState.decisions[slug] = {
        status: action,
        updatedAt: new Date().toISOString(),
      };
      saveTriageState(triageState);
      updateRowTriage(row, action);
      updateDrawer();
      if (filterTriagedOnly) {
        apply(false);
      }
    } else if (action === "reset") {
      delete triageState.decisions[slug];
      saveTriageState(triageState);
      updateRowTriage(row, null);
      updateDrawer();
      if (filterTriagedOnly) {
        apply(false);
      }
    }
  });

  // Category Pills
  categoryBar?.addEventListener("click", (event) => {
    const pill = event.target.closest("[data-topic]");
    if (!pill) return;
    const topic = pill.dataset.topic ?? "";
    const tagSelect = form.elements.namedItem("tag");
    if (tagSelect instanceof HTMLSelectElement) {
      tagSelect.value = topic;
    }
    updateCategoryPills(topic);
    apply(true);
  });

  // View Switcher
  viewSwitcher?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-view]");
    if (!btn) return;
    const view = btn.dataset.view;
    if (view && view !== currentView) {
      setView(view, true);
    }
  });

  // Expand / Collapse All Abstracts
  toggleAbstractsBtn?.addEventListener("click", () => {
    const details = Array.from(list.querySelectorAll(".paper-row__abstract"));
    if (details.length === 0) return;
    const anyClosed = details.some((d) => !d.open);
    for (const d of details) {
      d.open = anyClosed;
    }
    updateToggleAbstractsLabel();
  });

  list.addEventListener(
    "toggle",
    (event) => {
      if (
        event.target &&
        event.target.classList?.contains("paper-row__abstract")
      ) {
        updateToggleAbstractsLabel();
      }
    },
    true
  );

  // Floating Triage Drawer Actions
  copyCliBtn?.addEventListener("click", async () => {
    const decisions = triageState.decisions || {};
    const deepDiveSlugs = Object.keys(decisions).filter(
      (s) => decisions[s]?.status === "deep-dive"
    );

    if (deepDiveSlugs.length === 0) {
      showToast("No deep-dive candidates selected");
      return;
    }

    const commands = deepDiveSlugs
      .map((slug) => `gh workflow run summarize.yml -f paper_id=${slug}`)
      .join("\n");

    const ok = await copyToClipboard(commands);
    if (ok) {
      const count = deepDiveSlugs.length;
      const feedback = `Copied ${count} ${count === 1 ? "command" : "commands"}!`;
      const originalText =
        copyCliBtn.dataset.originalText || copyCliBtn.textContent;
      copyCliBtn.dataset.originalText = originalText;
      copyCliBtn.textContent = feedback;
      showToast(feedback);
      setTimeout(() => {
        copyCliBtn.textContent =
          copyCliBtn.dataset.originalText || "Copy CLI Commands";
      }, 2000);
    } else {
      showToast("Failed to copy commands to clipboard");
    }
  });

  exportJsonBtn?.addEventListener("click", () => {
    const dateStr = new Date().toISOString().slice(0, 10);
    const data = {
      exportedAt: new Date().toISOString(),
      decisions: triageState.decisions || {},
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deepgeno-triage-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Triage decisions exported as JSON");
  });

  filterOnlyBtn?.addEventListener("click", () => {
    filterTriagedOnly = !filterTriagedOnly;
    filterOnlyBtn.classList.toggle("is-active", filterTriagedOnly);
    filterOnlyBtn.setAttribute(
      "data-active",
      filterTriagedOnly ? "true" : "false"
    );
    filterOnlyBtn.setAttribute(
      "aria-pressed",
      filterTriagedOnly ? "true" : "false"
    );
    apply(false);
  });

  clearTriageBtn?.addEventListener("click", () => {
    triageState.decisions = {};
    saveTriageState(triageState);
    for (const item of items) {
      updateRowTriage(item, null);
    }
    updateDrawer();
    if (filterTriagedOnly) {
      filterTriagedOnly = false;
      if (filterOnlyBtn) {
        filterOnlyBtn.classList.remove("is-active");
        filterOnlyBtn.setAttribute("data-active", "false");
        filterOnlyBtn.setAttribute("aria-pressed", "false");
      }
    }
    apply(false);
    showToast("Triage decisions cleared");
  });

  // Filter Form Events
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    apply(true);
  });

  form.addEventListener("change", (event) => {
    if (event.target && event.target.name === "tag") {
      updateCategoryPills(event.target.value);
    }
    apply(true);
  });

  const clearFilterLink = form.querySelector("[data-clear]");
  clearFilterLink?.addEventListener("click", (event) => {
    event.preventDefault();
    form.reset();
    updateCategoryPills("");
    apply(true);
  });

  window.addEventListener("popstate", () => {
    setFormFromUrl();
    apply(false);
  });

  // Initial Hydration
  hydrateTriageState();
  setFormFromUrl();
  apply(false);
});
