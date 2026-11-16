/**
 * Interface state: which screen and record the address names, and what is open on top of it (overlay, panel,
 * modal, tab, selection, sort, form values). The provider owns it; controls ask for changes.
 */
export type ConsoleState = Record<string, unknown>;
export type ConsoleUpdate = ConsoleState | ((previous: ConsoleState) => ConsoleState);
