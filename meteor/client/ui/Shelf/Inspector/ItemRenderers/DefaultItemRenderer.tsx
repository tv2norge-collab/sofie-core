import * as React from 'react'
import { PieceUi } from '../../../SegmentTimeline/SegmentTimelineContainer'
import { IAdLibListItem } from '../../AdLibListItem'
import { RundownUtils } from '../../../../lib/rundown'
import { Piece } from '../../../../../lib/collections/Pieces'
import InspectorTitle from './InspectorTitle'
import { BucketAdLibUi } from '../../RundownViewBuckets'
import { AdLibPieceUi } from '../../../../lib/shelf'
import { UIShowStyleBase } from '../../../../../lib/api/showStyles'
import { UIStudio } from '../../../../../lib/api/studios'
import { unprotectString } from '@sofie-automation/corelib/dist/protectedString'

export default function DefaultItemRenderer(props: {
	piece: PieceUi | IAdLibListItem | BucketAdLibUi
	showStyleBase: UIShowStyleBase
	studio: UIStudio
}): JSX.Element {
	if (RundownUtils.isAdLibPiece(props.piece)) {
		const piece = props.piece as IAdLibListItem

		const packageName = piece.contentStatus?.packageName ?? null

		return (
			<>
				<InspectorTitle piece={props.piece} showStyleBase={props.showStyleBase} studio={props.studio} />
				{packageName}
				<dl>
					<dd>name</dd>
					<dt>{piece.name}</dt>
					<dd>externalId</dd>
					<dt>{piece.externalId}</dt>
					{(piece as AdLibPieceUi).partId ? (
						<>
							<dd>partId</dd>
							<dt>{unprotectString((piece as AdLibPieceUi).partId)}</dt>
						</>
					) : null}
					<dd>sourceLayerId</dd>
					<dt>{piece.sourceLayerId}</dt>
					<dd>outputLayerId</dd>
					<dt>{piece.outputLayerId}</dt>
					<dd>publicData</dd>
					<dt>{JSON.stringify(piece.publicData || {})}</dt>
				</dl>
			</>
		)
	} else {
		const piece = props.piece.instance.piece as Piece

		const packageName = props.piece.contentStatus?.packageName ?? null

		return (
			<>
				<InspectorTitle piece={props.piece} showStyleBase={props.showStyleBase} studio={props.studio} />
				{packageName}
				<dl>
					<dd>name</dd>
					<dt>{piece.name}</dt>
					<dd>externalId</dd>
					<dt>{piece.externalId}</dt>
					<dd>startPartId</dd>
					<dt>{unprotectString(piece.startPartId)}</dt>
					<dd>sourceLayerId</dd>
					<dt>{piece.sourceLayerId}</dt>
					<dd>outputLayerId</dd>
					<dt>{piece.outputLayerId}</dt>
					<dd>publicData</dd>
					<dt>{JSON.stringify(piece.publicData || {})}</dt>
				</dl>
			</>
		)
	}
}
