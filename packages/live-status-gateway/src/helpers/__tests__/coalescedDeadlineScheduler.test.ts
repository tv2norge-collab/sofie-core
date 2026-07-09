import { CoalescedDeadlineScheduler } from '../coalescedDeadlineScheduler.js'

const COALESCE_WINDOW_MS = 100

describe('CoalescedDeadlineScheduler', () => {
	beforeEach(() => {
		jest.useFakeTimers()
		jest.setSystemTime(0)
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	it('fires once, no earlier than the requested deadline', () => {
		const callback = jest.fn()
		const scheduler = new CoalescedDeadlineScheduler(COALESCE_WINDOW_MS, callback)

		scheduler.scheduleAt(250)

		jest.advanceTimersByTime(250)
		expect(callback).not.toHaveBeenCalled()

		jest.advanceTimersByTime(COALESCE_WINDOW_MS)
		expect(callback).toHaveBeenCalledTimes(1)
	})

	it('coalesces deadlines within the same window into a single invocation', () => {
		const callback = jest.fn()
		const scheduler = new CoalescedDeadlineScheduler(COALESCE_WINDOW_MS, callback)

		scheduler.scheduleAt(210)
		scheduler.scheduleAt(250)
		scheduler.scheduleAt(299)

		jest.advanceTimersByTime(1000)
		expect(callback).toHaveBeenCalledTimes(1)
	})

	it('moves the pending fire earlier when an earlier deadline is requested', () => {
		const callback = jest.fn()
		const scheduler = new CoalescedDeadlineScheduler(COALESCE_WINDOW_MS, callback)

		scheduler.scheduleAt(850)
		scheduler.scheduleAt(250)

		jest.advanceTimersByTime(300)
		expect(callback).toHaveBeenCalledTimes(1)
	})

	it('ignores a later deadline while an earlier fire is pending', () => {
		const callback = jest.fn()
		const scheduler = new CoalescedDeadlineScheduler(COALESCE_WINDOW_MS, callback)

		scheduler.scheduleAt(250)
		scheduler.scheduleAt(850)

		jest.advanceTimersByTime(300)
		expect(callback).toHaveBeenCalledTimes(1)

		// the later deadline was dropped; the callback is expected to re-schedule it
		jest.advanceTimersByTime(1000)
		expect(callback).toHaveBeenCalledTimes(1)
	})

	it('fires immediately-ish for deadlines in the past', () => {
		jest.setSystemTime(5000)
		const callback = jest.fn()
		const scheduler = new CoalescedDeadlineScheduler(COALESCE_WINDOW_MS, callback)

		scheduler.scheduleAt(1000)

		jest.advanceTimersByTime(0)
		expect(callback).toHaveBeenCalledTimes(1)
	})

	it('does not fire after cancel', () => {
		const callback = jest.fn()
		const scheduler = new CoalescedDeadlineScheduler(COALESCE_WINDOW_MS, callback)

		scheduler.scheduleAt(250)
		scheduler.cancel()

		jest.advanceTimersByTime(1000)
		expect(callback).not.toHaveBeenCalled()
	})

	it('can schedule again after firing', () => {
		const callback = jest.fn()
		const scheduler = new CoalescedDeadlineScheduler(COALESCE_WINDOW_MS, callback)

		scheduler.scheduleAt(250)
		jest.advanceTimersByTime(400)
		expect(callback).toHaveBeenCalledTimes(1)

		scheduler.scheduleAt(650)
		jest.advanceTimersByTime(400)
		expect(callback).toHaveBeenCalledTimes(2)
	})
})
