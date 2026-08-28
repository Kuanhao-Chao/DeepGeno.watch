const normalize = (value) => String(value ?? "").trim();

document.querySelectorAll("[data-explorer]").forEach((explorer) => {
  const form = explorer.querySelector("[data-filter-form]");
  const list = explorer.querySelector("[data-paper-list]");
  const count = explorer.querySelector("[data-result-count]");
  const empty = explorer.querySelector("[data-filtered-empty]");
  if (!form || !list || !count) return;

  const items = Array.from(list.querySelectorAll("[data-paper]"));
  const defaultProgress = explorer.dataset.defaultProgress ?? "all";

  const setFormFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    for (const element of Array.from(form.elements)) {
      if (!(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement
      ))
        continue;
      if (!element.name) continue;
      const fallback =
        element.name === "progress" && defaultProgress !== "all"
          ? defaultProgress
          : "";
      const defaultValue = element.name === "sort" ? "newest" : fallback;
      element.value = params.get(element.name) ?? defaultValue;
    }
  };

  const apply = (writeUrl = false) => {
    const values = new FormData(form);
    const query = normalize(values.get("q")).toLocaleLowerCase();
    const tag = normalize(values.get("tag")).toLocaleLowerCase();
    const priority = normalize(values.get("priority"));
    const progress = normalize(values.get("progress"));
    const sort = normalize(values.get("sort")) || "newest";

    let visible = 0;
    for (const item of items) {
      let itemTags = [];
      try {
        itemTags = JSON.parse(item.dataset.tags ?? "[]");
      } catch {
        itemTags = [];
      }

      const matches =
        (!query || (item.dataset.search ?? "").includes(query)) &&
        (!tag || itemTags.includes(tag)) &&
        (!priority || item.dataset.priority === priority) &&
        (!progress || item.dataset.progress === progress);
      item.hidden = !matches;
      if (matches) visible += 1;
    }

    const direction = sort === "oldest" ? 1 : -1;
    items
      .toSorted((left, right) => {
        if (sort === "priority") {
          const rank =
            Number(left.dataset.priorityRank) -
            Number(right.dataset.priorityRank);
          if (rank !== 0) return rank;
        }
        return (
          direction *
          (left.dataset.date ?? "").localeCompare(right.dataset.date ?? "")
        );
      })
      .forEach((item) => list.append(item));

    count.textContent = `${visible} ${visible === 1 ? "paper" : "papers"}`;
    if (empty) empty.hidden = visible !== 0;

    if (writeUrl) {
      const params = new URLSearchParams();
      for (const [key, rawValue] of values.entries()) {
        const value = normalize(rawValue);
        const isImplicitProgress =
          key === "progress" && value === defaultProgress;
        const isDefaultSort = key === "sort" && value === "newest";
        if (value && !isImplicitProgress && !isDefaultSort)
          params.set(key, value);
      }
      const search = params.size ? `?${params.toString()}` : "";
      window.history.pushState({}, "", `${window.location.pathname}${search}`);
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    apply(true);
  });
  window.addEventListener("popstate", () => {
    setFormFromUrl();
    apply(false);
  });

  setFormFromUrl();
  apply(false);
});
