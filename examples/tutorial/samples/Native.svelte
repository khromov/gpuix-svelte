<script lang="ts">
	let text = $state('');
	let notes = $state('');

	const STAR =
		'<svg viewBox="0 0 24 24">' +
		'<path d="M12 2l3 7h7l-5.5 4.5 2 8.5L12 17.5 5.5 22l2-8.5L2 9h7z"/></svg>';
	const FIELD =
		'padding: 8px 10px; border-radius: 6px; border-width: 1px; ' +
		'border-color: #45475a; background-color: #181825; color: #cdd6f4; ' +
		'font-size: 13px';
</script>

<div style="display: flex; flex-direction: column; gap: 10px">
	<input
		value={text}
		placeholder="type here — native caret, selection and IME"
		onchange={(e) => (text = e.value)}
		style={FIELD}
	/>
	<div style="font-size: 12px; color: #a6adc8">{text.length} characters</div>

	<textarea
		value={notes}
		minRows={3}
		placeholder="a textarea sizes itself by rows"
		onchange={(e) => (notes = e.value)}
		style={FIELD}
	></textarea>

	<div style="display: flex; flex-direction: row; align-items: center; gap: 8px">
		<svg source={STAR} style="width: 20px; height: 20px; color: #f9e2af"></svg>
		<div style="font-size: 12px; color: #a6adc8">an svg icon, tinted by its color</div>
	</div>
</div>
