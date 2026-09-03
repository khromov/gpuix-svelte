/** The polling intervals a feed can be given; croner's six-field form, seconds first. */

export const SCHEDULES: Array<{ value: string; label: string }> = [
	{ value: '0 0 * * * *', label: 'Hourly' },
	{ value: '0 0 */4 * * *', label: 'Every 4h' },
	{ value: '0 0 */12 * * *', label: 'Every 12h' },
	// A machine asleep at three in the morning catches up at the next launch.
	{ value: '0 0 3 * * *', label: 'Daily' }
];

export const DEFAULT_SCHEDULE = SCHEDULES[1].value;

export const schedule_label = (expr: string): string => SCHEDULES.find((s) => s.value === expr)?.label ?? expr;
