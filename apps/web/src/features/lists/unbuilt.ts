import type { ListPage } from "./use-list";

/** The page of a list that nothing feeds yet: always empty. */
export const nothing = async <Item>(): Promise<ListPage<Item>> => ({ items: [], page: { has_more: false, next_cursor: null, total_count: 0 } });
