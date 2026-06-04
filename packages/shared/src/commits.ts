// Sentinel sha that reuses `card_commits` (on the `(card_id, sha)` unique key)
// to carry a card's pending working-tree diff without a schema change.
export const WORKING_TREE_SHA = '__working__'
