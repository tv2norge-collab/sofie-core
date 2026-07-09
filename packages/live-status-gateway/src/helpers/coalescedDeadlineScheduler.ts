/**
 * Schedules a callback to fire at requested wall-clock times (unix ms), guaranteeing that it
 * never fires before a requested deadline, while coalescing deadlines that fall close together
 * into a single invocation.
 *
 * Each deadline is rounded up to the end of its coalescing window, so multiple deadlines within
 * the same window share one invocation. If a fire is already pending at or before the requested
 * time, the request is ignored — the callback is expected to re-schedule any deadlines that are
 * still in the future when it runs.
 */
export class CoalescedDeadlineScheduler {
	private _timeout: NodeJS.Timeout | undefined
	private _scheduledFireTime: number | undefined

	constructor(
		private readonly _coalesceWindowMs: number,
		private readonly _callback: () => void
	) {}

	scheduleAt(deadline: number): void {
		const fireTime = (Math.floor(deadline / this._coalesceWindowMs) + 1) * this._coalesceWindowMs
		if (this._scheduledFireTime !== undefined && this._scheduledFireTime <= fireTime) {
			return
		}
		this.cancel()
		this._scheduledFireTime = fireTime
		this._armTimeout(fireTime)
	}

	cancel(): void {
		if (this._timeout !== undefined) {
			clearTimeout(this._timeout)
			this._timeout = undefined
		}
		this._scheduledFireTime = undefined
	}

	private _armTimeout(fireTime: number): void {
		this._timeout = setTimeout(
			() => {
				// timers may fire marginally early; re-arm to guarantee we never run before the deadline
				if (Date.now() < fireTime) {
					this._armTimeout(fireTime)
					return
				}
				this._timeout = undefined
				this._scheduledFireTime = undefined
				this._callback()
			},
			Math.max(0, fireTime - Date.now())
		)
	}
}
