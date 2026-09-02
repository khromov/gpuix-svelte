export interface Store {
	count: number;
}

export const store: Store = $state({ count: 0 });

export function bump(): void {
	store.count++;
}
