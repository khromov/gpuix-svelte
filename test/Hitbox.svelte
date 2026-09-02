<script lang="ts">
	const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10H0z" fill="currentColor"/></svg>';
	const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

	let clicks = $state({ card: 0, button: 0 });
	let tone = $state('red');
</script>

<div class="page">
	<div class="card" hitbox="self" onclick={() => clicks.card++} testId="card">
		<div class="badge" testId="badge">badge</div>
		<img src={PIXEL} class="pic" testId="pic" />
		<div class="button" onclick={() => clicks.button++} testId="button">
			<div class="inner" testId="inner">button</div>
		</div>
		<input testId="field" />
		<div class="scroller" testId="scroller"><div class="tall">tall</div></div>
	</div>

	<div class="parent {tone}" testId="parent">
		<svg source={ICON} class="icon" testId="icon"></svg>
		<svg source={ICON} class="icon own" testId="own"></svg>
	</div>
	<div class="toggle" onclick={() => (tone = 'green')} testId="toggle">toggle</div>

	<div testId="counts">{clicks.card}-{clicks.button}</div>
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 8px; padding: 8px; }
	.card { display: flex; flex-direction: row; align-items: center; gap: 8px; padding: 8px; background-color: #333333; }
	.badge { padding: 4px 8px; background-color: #555555; }
	.pic { width: 20px; height: 20px; }
	.button { padding: 4px; background-color: #777777; }
	.inner { padding: 4px 8px; background-color: #999999; }
	.scroller { height: 30px; width: 60px; overflow-y: scroll; }
	.tall { height: 100px; }
	.parent { display: flex; flex-direction: row; gap: 8px; }
	.parent.red { color: red; }
	.parent.green { color: green; }
	.icon { width: 16px; height: 16px; }
	.own { color: blue; }
	.toggle { padding: 4px; }
</style>
