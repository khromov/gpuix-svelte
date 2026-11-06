<script lang="ts">
	let text = $state('');
	let notes = $state('');

	const STAR =
		'<svg viewBox="0 0 24 24">' +
		'<path d="M12 2l3 7h7l-5.5 4.5 2 8.5L12 17.5 5.5 22l2-8.5L2 9h7z"/></svg>';
	const FIELD =
		'padding: 8px 10px; border-radius: 8px; border-width: 1px; ' +
		'border-color: #404040; background-color: #000000; color: #ededed; ' +
		'font-size: 13px';
</script>

<div style="display: flex; flex-direction: column; gap: 10px">
	<input
		value={text}
		placeholder="type here — native caret, selection and IME"
		onchange={(e) => (text = e.value)}
		style={FIELD}
	/>
	<div style="font-size: 12px; color: #a1a1a1">{text.length} characters</div>

	<textarea
		value={notes}
		minRows={3}
		placeholder="a textarea sizes itself by rows"
		onchange={(e) => (notes = e.value)}
		style={FIELD}
	></textarea>

	<div style="display: flex; flex-direction: row; align-items: center; gap: 8px">
		<svg source={STAR} style="width: 20px; height: 20px; color: #f5a524"></svg>
		<div style="font-size: 12px; color: #a1a1a1">an svg icon, tinted by its color</div>
	</div>
</div>
