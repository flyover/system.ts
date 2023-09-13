interface SystemConfiguration {
    readonly baseUrl?: string;
    readonly map?: Partial<SystemImportMap>;
}
type SystemConfigure = (config: Readonly<SystemConfiguration>) => void;
interface SystemImportMap {
    scopes: SystemScopes;
    imports: SystemImports;
}
type SystemScopes = Record<string, SystemImports>;
type SystemImports = Record<string, string>;
interface SystemExports extends Record<string, any> {
    default?: any;
}
type SystemRegister = (deps: string[], declare: SystemDeclare) => void;
interface SystemRegistration {
    deps: string[];
    declare: SystemDeclare;
}
type SystemDeclare = (_export: SystemExport, context?: SystemContext) => SystemDeclaration;
interface SystemDeclaration {
    setters?: SystemSetter[];
    execute?: SystemExecute;
}
type SystemSetter = (exports: SystemExports) => void;
type SystemExecute = () => void | Promise<void>;
interface SystemContext {
    id: string;
    import: SystemImport;
    meta?: SystemMeta;
}
type SystemImport = (id: string, parent_url?: string) => Promise<SystemExports>;
type SystemExport = SystemExportObject | SystemExportProperty;
type SystemExportObject = (exports: Record<string, any>) => SystemExports;
type SystemExportProperty = <T>(key: string, value: T) => T;
interface SystemMeta {
    url: string;
    resolve: SystemResolve;
}
type SystemResolve = (id: string, parent_url?: string) => Promise<string>;
declare class SystemModule {
    readonly loader: SystemLoader;
    readonly url: string;
    private readonly dep_modules;
    private load_done;
    private link_done;
    private execute;
    private readonly setters;
    private readonly exports;
    private readonly dep_load_done;
    private readonly dep_link_done;
    constructor(loader: SystemLoader, url: string);
    private _load;
    private _link;
    private _export_object;
    private _export_property;
    process(): Promise<SystemExports>;
    private _process_load;
    private _process_link;
}
declare class SystemLoader {
    private base_url;
    private readonly import_map;
    readonly registry: Map<string, SystemModule>;
    private init_configs;
    private init_modules;
    config(config: Readonly<SystemConfiguration>): void;
    import(id: string, parent_url?: string): Promise<SystemExports>;
    resolve(id: string, parent_url?: string): Promise<string>;
    private static _try_parse_url;
    private static _try_parse_url_like;
    private static _parse_import_map;
    private static _parse_scopes;
    private static _parse_imports;
    private static _resolve_import_map;
    private static _resolve_scopes;
    private static _resolve_imports;
    static readonly PLATFORM: "browser" | "command";
    static __get_root_url(): string;
    static __load_text(url: string): Promise<string>;
    static __get_init_configs(): Promise<Set<Readonly<SystemConfiguration>>>;
    static __get_init_module_ids(): Promise<Set<string>>;
    static __require(id: string): SystemExports;
}
interface global {
    readonly SystemLoader: typeof SystemLoader;
}
declare const System: SystemLoader;
interface global {
    readonly System: SystemLoader;
}
