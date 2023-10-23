const ws = new WebSocket(`ws://localhost:8080`)
ws.addEventListener('message', (message) => {
	const data = JSON.parse(message.data)
	switch (data.event) {
		case 'pong':
			handlePong(data)
			break
		case 'heartbeat':
			handleHeartbeat(data)
			break
		case 'subscriptionStatus':
			handleSubscriptionStatus(data)
			break
		case 'studio':
			handleStudio(data)
			break
		case 'activePlaylist':
			handleActivePlaylist(data)
			break
		case 'segments':
			handleSegments(data)
			break
	}
})

ws.addEventListener('open', () => {
	console.log('socket open')

	ws.send(JSON.stringify({ event: 'subscribe', subscription: { name: 'activePlaylist' }, reqid: 1 }))

	ws.send(JSON.stringify({ event: 'subscribe', subscription: { name: 'segments' }, reqid: 2 }))
})

ws.addEventListener('close', () => {
	console.log('socket close')
})

ws.addEventListener('error', (error) => {
	console.log('socket error', error)
})

function handlePong() {
	//
}

function handleHeartbeat() {
	//
}

function handleSubscriptionStatus() {
	//
}

function handleStudio() {
	//
}

const TIME_OF_DAY_SPAN_ID = 'time-of-day'
const SEGMENT_DURATION_SPAN_CLASS = 'segment-duration'
const SEGMENT_REMAINIG_SPAN_ID = 'segment-remaining'
const PART_REMAINIG_SPAN_ID = 'part-remaining'
const SEGMENTS_DIV_ID = 'segments'
const ENABLE_SYNCED_TICKS = true

let activePlaylist = {}

function handleActivePlaylist(data) {
	activePlaylist = data
}

setInterval(() => {
	const segmentRemainingEl = document.getElementById(SEGMENT_REMAINIG_SPAN_ID)
	const partRemainingEl = document.getElementById(PART_REMAINIG_SPAN_ID)
	const segmentEndTime = activePlaylist.currentSegment && activePlaylist.currentSegment.timing.expectedEndTime
	const partEndTime = activePlaylist.currentPart && activePlaylist.currentPart.timing.expectedEndTime

	const currentSegmentId = activePlaylist.currentPart && activePlaylist.currentPart.segmentId
	const now = ENABLE_SYNCED_TICKS ? Math.floor(Date.now() / 1000) * 1000 : Date.now()
	if (currentSegmentId && activePlaylist.currentPart) {
		const currentSegmentEl = document.getElementById(activePlaylist.currentPart.segmentId)
		if (currentSegmentEl) {
			const durationEl = currentSegmentEl.querySelector('.' + SEGMENT_DURATION_SPAN_CLASS)
			durationEl.textContent = formatMillisecondsToTime(segmentEndTime - now)
		}
	}
	if (segmentEndTime) segmentRemainingEl.textContent = formatMillisecondsToTime(segmentEndTime - now)
	if (partEndTime) partRemainingEl.textContent = formatMillisecondsToTime(Math.ceil(partEndTime / 1000) * 1000 - now)
	updateClock()
}, 100)

function updateClock() {
	const now = new Date()
	const hours = now.getHours()
	const minutes = now.getMinutes()
	const seconds = now.getSeconds()
	const formattedTime = formatMillisecondsToTime(hours * 3600000 + minutes * 60000 + seconds * 1000)

	const clockElement = document.getElementById(TIME_OF_DAY_SPAN_ID)
	if (clockElement) {
		clockElement.textContent = formattedTime
	}
}

function handleSegments(data) {
	const targetDiv = document.getElementById(SEGMENTS_DIV_ID)

	if (targetDiv) {
		const existingUl = targetDiv.querySelector('ul')
		if (existingUl) {
			targetDiv.removeChild(existingUl)
		}

		const ul = document.createElement('ul')

		data.segments.forEach((segment) => {
			const li = document.createElement('li')
			li.id = segment.id
			const spanElement = document.createElement('span')
			spanElement.classList = [SEGMENT_DURATION_SPAN_CLASS]
			spanElement.textContent = formatMillisecondsToTime(
				segment.timing.budgetDurationMs || segment.timing.expectedDurationMs
			)
			const textNodeAfter = document.createTextNode(' ' + segment.name)
			li.appendChild(spanElement)
			li.appendChild(textNodeAfter)
			ul.appendChild(li)
		})

		targetDiv.appendChild(ul)
	}
}

function formatMillisecondsToTime(milliseconds) {
	const isNegative = milliseconds < 0
	milliseconds = Math.abs(milliseconds)

	const totalSeconds = Math.round(milliseconds / 1000)
	const totalMinutes = Math.floor(totalSeconds / 60)
	const totalHours = Math.floor(totalMinutes / 60)

	const formattedHours = String(totalHours).padStart(2, '0')
	const formattedMinutes = String(totalMinutes % 60).padStart(2, '0')
	const formattedSeconds = String(totalSeconds % 60).padStart(2, '0')

	return `${isNegative ? '+' : ''}${formattedHours}:${formattedMinutes}:${formattedSeconds}`
}
