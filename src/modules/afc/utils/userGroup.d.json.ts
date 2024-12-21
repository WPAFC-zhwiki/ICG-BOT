declare const module: {
	localGroups: Record<string, string>;
	globalGroups: Record<string, string>;
	ignoreLocalGroups: string[];
	ignoreGlobalGroups: string[];
};

export = module;
