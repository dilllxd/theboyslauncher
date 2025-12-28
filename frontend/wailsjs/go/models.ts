export namespace launcher {
	
	export class PackwizInfo {
	    url?: string;
	    version?: string;
	    name?: string;
	    author?: string;
	
	    static createFrom(source: any = {}) {
	        return new PackwizInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.version = source["version"];
	        this.name = source["name"];
	        this.author = source["author"];
	    }
	}
	export class WindowResolution {
	    width: number;
	    height: number;
	
	    static createFrom(source: any = {}) {
	        return new WindowResolution(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.width = source["width"];
	        this.height = source["height"];
	    }
	}
	export class InstanceConfig {
	    resolution: WindowResolution;
	    java: string;
	    java_args: string;
	    custom_jar: string;
	    min_memory: number;
	    max_memory: number;
	    packwiz?: PackwizInfo;
	
	    static createFrom(source: any = {}) {
	        return new InstanceConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.resolution = this.convertValues(source["resolution"], WindowResolution);
	        this.java = source["java"];
	        this.java_args = source["java_args"];
	        this.custom_jar = source["custom_jar"];
	        this.min_memory = source["min_memory"];
	        this.max_memory = source["max_memory"];
	        this.packwiz = this.convertValues(source["packwiz"], PackwizInfo);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Instance {
	    name: string;
	    game_version: string;
	    mod_loader: string;
	    mod_loader_version?: string;
	    config: InstanceConfig;
	
	    static createFrom(source: any = {}) {
	        return new Instance(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.game_version = source["game_version"];
	        this.mod_loader = source["mod_loader"];
	        this.mod_loader_version = source["mod_loader_version"];
	        this.config = this.convertValues(source["config"], InstanceConfig);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	

}

export namespace main {
	
	export class AccountInfo {
	    id: string;
	    username: string;
	    uuid: string;
	    last_used: string;
	    is_active: boolean;
	    needs_login: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AccountInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.username = source["username"];
	        this.uuid = source["uuid"];
	        this.last_used = source["last_used"];
	        this.is_active = source["is_active"];
	        this.needs_login = source["needs_login"];
	    }
	}
	export class GlobalSettings {
	    javaPath: string;
	    defaultMinMemory: number;
	    defaultMaxMemory: number;
	    windowWidth: number;
	    windowHeight: number;
	    autoUpdate: boolean;
	    closeOnLaunch: boolean;
	
	    static createFrom(source: any = {}) {
	        return new GlobalSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.javaPath = source["javaPath"];
	        this.defaultMinMemory = source["defaultMinMemory"];
	        this.defaultMaxMemory = source["defaultMaxMemory"];
	        this.windowWidth = source["windowWidth"];
	        this.windowHeight = source["windowHeight"];
	        this.autoUpdate = source["autoUpdate"];
	        this.closeOnLaunch = source["closeOnLaunch"];
	    }
	}
	export class InstanceUpdateInfo {
	    name: string;
	    has_update: boolean;
	    new_version?: string;
	    current_version?: string;
	
	    static createFrom(source: any = {}) {
	        return new InstanceUpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.has_update = source["has_update"];
	        this.new_version = source["new_version"];
	        this.current_version = source["current_version"];
	    }
	}
	export class LaunchProgress {
	    stage: string;
	    progress: number;
	    message: string;
	    totalSteps: number;
	    currentStep: number;
	    fileName: string;
	
	    static createFrom(source: any = {}) {
	        return new LaunchProgress(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.stage = source["stage"];
	        this.progress = source["progress"];
	        this.message = source["message"];
	        this.totalSteps = source["totalSteps"];
	        this.currentStep = source["currentStep"];
	        this.fileName = source["fileName"];
	    }
	}
	export class LoaderVersion {
	    id: string;
	    stable: boolean;
	    version: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new LoaderVersion(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.stable = source["stable"];
	        this.version = source["version"];
	        this.name = source["name"];
	    }
	}
	export class MigrationInfo {
	    can_migrate: boolean;
	    installations: string[];
	    estimated_size: number;
	    instance_count: number;
	
	    static createFrom(source: any = {}) {
	        return new MigrationInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.can_migrate = source["can_migrate"];
	        this.installations = source["installations"];
	        this.estimated_size = source["estimated_size"];
	        this.instance_count = source["instance_count"];
	    }
	}
	export class MinecraftVersion {
	    id: string;
	    type: string;
	    displayName: string;
	    releaseTime: string;
	
	    static createFrom(source: any = {}) {
	        return new MinecraftVersion(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.displayName = source["displayName"];
	        this.releaseTime = source["releaseTime"];
	    }
	}
	export class Modpack {
	    id: string;
	    displayName: string;
	    packUrl: string;
	    instanceName: string;
	    description: string;
	    author: string;
	    tags: string[];
	    lastUpdated: string;
	    category: string;
	    default: boolean;
	    minRam: number;
	    recommendedRam: number;
	    changelog: string;
	
	    static createFrom(source: any = {}) {
	        return new Modpack(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.displayName = source["displayName"];
	        this.packUrl = source["packUrl"];
	        this.instanceName = source["instanceName"];
	        this.description = source["description"];
	        this.author = source["author"];
	        this.tags = source["tags"];
	        this.lastUpdated = source["lastUpdated"];
	        this.category = source["category"];
	        this.default = source["default"];
	        this.minRam = source["minRam"];
	        this.recommendedRam = source["recommendedRam"];
	        this.changelog = source["changelog"];
	    }
	}
	export class VersionFilters {
	    release: boolean;
	    snapshot: boolean;
	    beta: boolean;
	    alpha: boolean;
	
	    static createFrom(source: any = {}) {
	        return new VersionFilters(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.release = source["release"];
	        this.snapshot = source["snapshot"];
	        this.beta = source["beta"];
	        this.alpha = source["alpha"];
	    }
	}

}

export namespace migration {
	
	export class MigrationResult {
	    success: boolean;
	    migrated_items: Record<string, string>;
	    skipped_items: string[];
	    errors: string[];
	    backup_path: string;
	    total_size: number;
	    duration: number;
	
	    static createFrom(source: any = {}) {
	        return new MigrationResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.migrated_items = source["migrated_items"];
	        this.skipped_items = source["skipped_items"];
	        this.errors = source["errors"];
	        this.backup_path = source["backup_path"];
	        this.total_size = source["total_size"];
	        this.duration = source["duration"];
	    }
	}

}

