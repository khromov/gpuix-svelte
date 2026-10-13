<div class="column" testId="column"><div class="tall">tall</div></div>
<div class="label" testId="label">label</div>
<div class="sized fit" testId="sized">sized</div>
<div class="themed" testId="themed">themed</div>

<style>
	.column { height: 30px; overflow-y: auto; }
	.tall { height: 100px; }
	.label { font-size: 1rem; padding: 0.5rem 1rem; }
	.sized { width: 300px; min-width: 300px; }
	.sized.fit { width: max-content; min-width: fit-content(200px); }
	.themed { padding: var(--parity-pad); overflow: var(--parity-overflow, auto); }
</style>
