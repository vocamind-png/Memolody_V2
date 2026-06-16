function getPrimaryNote(noteEl: Element): Element {
  if (!noteEl.querySelector("chord")) return noteEl;
  let curr = noteEl.previousElementSibling;
  while (curr) {
    if (curr.tagName === "note" && !curr.querySelector("chord")) {
      return curr;
    }
    curr = curr.previousElementSibling;
  }
  return noteEl;
}
