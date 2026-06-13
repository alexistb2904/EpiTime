export type ZeusEvent = {
	id?: string | number;
	idReservation?: string | number;
	isManual?: boolean;
	isIgnored?: boolean;
	name?: string;
	typeName?: string;
	code?: string;
	url?: string;
	creationDate?: string;
	startDate: string;
	endDate: string;
	rooms?: Array<{ id?: string | number; name?: string; room?: { id?: string | number; name?: string } }>;
	teachers?: Array<{ id?: string | number; displayname?: string; firstname?: string; name?: string }>;
	groups?: Array<{ id?: string | number; name?: string }>;
	isOnline?: boolean;
	isCancelled?: boolean;
	isCanceled?: boolean;
	cancelledAt?: string;
	cancellationReason?: string;
	courseTypeName?: string;
	idType?: string | number;
};
export type Group = { id: string | number; name: string; idParent?: string | number | null };
export type Room = { id: string | number; name: string; capacity?: number; idRoomType?: string | number; id_parent?: string | number | null };
export type RoomType = { id: string | number; type: string };
export type LocationNode = {
	id: string | number;
	name?: string;
	type?: string;
	id_type?: number;
	id_parent?: string | number | null;
	children?: LocationNode[];
};
export type MicrosoftProfile = {
	id?: string;
	displayName?: string;
	mail?: string | null;
	userPrincipalName?: string;
};

export type Session = { microsoftAccessToken: string; zeusToken: string; account?: MicrosoftProfile | Record<string, unknown> | null };
