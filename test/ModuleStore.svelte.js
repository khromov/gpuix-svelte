export const store = $state({ count: 0 });

export function bump() {
	store.count++;
}
