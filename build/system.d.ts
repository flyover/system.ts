interface SystemConfiguration {
    readonly baseUrl?: string;
    readonly map?: Partial<SystemImportMap>;
}
declare type SystemConfigure = (config: Readonly<SystemConfiguration>) => void;
interface SystemImportMap {
    scopes: SystemScopes;
    imports: SystemImports;
}
declare type SystemScopes = Record<string, SystemImports>;
declare type SystemImports = Record<string, string>;
interface SystemExports extends Record<string, any> {
    default?: any;
}
declare type SystemRegister = (deps: string[], declare: SystemDeclare) => void;
interface SystemRegistration {
    deps: string[];
    declare: SystemDeclare;
}
declare type SystemDeclare = (_export: SystemExport, context?: SystemContext) => SystemDeclaration;
interface SystemDeclaration {
    setters: (SystemSetter | undefined)[];
    execute: SystemExecute | undefined;
}
declare type SystemSetter = (exports: SystemExports) => void;
declare type SystemExecute = () => void | Promise<void>;
interface SystemContext {
    id: string;
    import: SystemImport;
    meta?: SystemMeta;
}
declare type SystemImport = (id: string) => Promise<SystemExports>;
declare type SystemExport = SystemExportObject | SystemExportProperty;
declare type SystemExportObject = (exports: Record<string, any>) => SystemExports;
declare type SystemExportProperty = <T>(key: string, value: T) => typeof value;
interface SystemMeta {
    url: string;
    resolve: SystemResolve;
}
declare type SystemResolve = (id: string) => string;
declare class SystemModule {
    readonly url: string;
    readonly dep_modules: Set<SystemModule>;
    load: (() => Promise<void>) | null;
    link: (() => Promise<void>) | null;
    execute: SystemExecute | null;
    readonly setters: Set<SystemSetter>;
    readonly exports: SystemExports;
    constructor(url: string);
}
declare class SystemLoader {
    private init;
    private base_url;
    private readonly import_map;
    private readonly registry;
    config(config: Readonly<SystemConfiguration>): void;
    import(id: string): Promise<SystemExports>;
    private _init;
    private _import_module;
    private _resolve_url;
    private _make_module;
    private static _load_module;
    private static _link_module;
    private static _try_parse_url;
    private static _try_parse_url_like;
    private static _parse_import_map;
    private static _parse_scopes;
    private static _parse_imports;
    private static _resolve_import_map;
    private static _resolve_scopes;
    private static _resolve_imports;
    private static readonly PLATFORM;
    private static __get_root_url;
    private static __load_text;
    private static __get_init_configs;
    private static __get_init_module_ids;
}
declare const System: SystemLoader;
interface global {
    readonly System: SystemLoader;
}
interface global {
    readonly SystemLoader: typeof SystemLoader;
}
