//
// Copyright (c) Flyover Games, LLC
//

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

class SystemModule {
  private readonly dep_modules: Set<SystemModule> = new Set(); // dependent modules
  private load_done: Promise<void> | null = null;
  private link_done: Promise<void> | null = null;
  private execute: SystemExecute | null = null;
  private readonly setters: Set<SystemSetter> = new Set(); // setters for modules dependent on this module
  private readonly exports: SystemExports = Object.create(null);
  private readonly dep_load_done: Set<string> = new Set();
  private readonly dep_link_done: Set<string> = new Set();

  public constructor(public readonly loader: SystemLoader, public readonly url: string) {
    this.loader.registry.set(this.url, this);
    Object.defineProperty(this.exports, Symbol.toStringTag, { value: "Module" });
  }

  private async _load(): Promise<void> {
    const source: string = await SystemLoader.__load_text(this.url);
    const eval_args: Map<string, any> = new Map();

    let registration: SystemRegistration = { deps: [], declare: (_export: SystemExport, context?: SystemContext): SystemDeclaration => ({}) };
    const register: SystemRegister = (deps: string[], declare: SystemDeclare): void => { registration = { deps, declare }; };
    eval_args.set("System", { register });

    // TODO: add hint for CommonJS modules?
    if (!false) {
      type CJS_Module = { exports: SystemExports };
      const cjs_exports: SystemExports = this.exports;
      const cjs_module: CJS_Module = {
        get exports(): SystemExports { return cjs_exports; },
        set exports(value: SystemExports) { if (value !== cjs_exports) { cjs_exports.default = value; } }
      };
      const cjs_deps: string[] = [];
      const cjs_setters: SystemSetter[] = [];
      const cjs_require = (dep_id: string): SystemExports => {
        // throw new Error(`TODO: cjs_require("${dep_id}")`);
        return SystemLoader.__require(dep_id);
      };
      const cjs_declare: SystemDeclare = (_export: SystemExport, context?: SystemContext): SystemDeclaration => {
        const cjs_execute: SystemExecute = (): void => {};
        return { setters: cjs_setters, execute: cjs_execute };
      };
      register(cjs_deps, cjs_declare);
      eval_args.set("module", cjs_module);
      eval_args.set("exports", cjs_exports);
      eval_args.set("require", cjs_require);
    }

    // TODO: add hint for AMD modules?
    if (!false) {
      type AMD_Export = (...amd_dep_exports: SystemExports[]) => SystemExports | undefined;
      type AMD_Define = (amd_export: AMD_Export) => void;
      type AMD_DepsDefine = (amd_dep_ids: string[], amd_export: AMD_Export) => void;
      type AMD_NameDepsDefine = (amd_name: string, amd_dep_ids: string[], amd_export: AMD_Export) => void;
      const amd_define: AMD_Define | AMD_DepsDefine | AMD_NameDepsDefine = (...args: any[]): void => {
        const amd_name: string = args.length === 3 ? args[0] : "";
        const amd_dep_ids: string[] = args.length === 3 ? args[1] : args.length === 2 ? args[0] : [];
        const amd_export: AMD_Export = args.length === 3 ? args[2] : args.length === 2 ? args[1] : args[0];
        const amd_deps: string[] = [];
        const amd_dep_exports: SystemExports[] = [];
        const amd_setters: SystemSetter[] = [];
        const amd_require = (dep_id: string): SystemExports => {
          // throw new Error(`TODO: amd_require("${dep_id}")`);
          return SystemLoader.__require(dep_id);
        };
        for (const [amd_dep_index, amd_dep_id] of amd_dep_ids.entries()) {
          switch (amd_dep_id) {
            case "require": amd_dep_exports[amd_dep_index] = amd_require; break;
            case "module": amd_dep_exports[amd_dep_index] = this; break;
            case "exports": amd_dep_exports[amd_dep_index] = this.exports; break;
            default:
              amd_deps[amd_dep_index] = amd_dep_id;
              amd_setters[amd_dep_index] = (dep_exports: SystemExports): void => { amd_dep_exports[amd_dep_index] = dep_exports; };
              break;
          }
        }
        const amd_declare: SystemDeclare = (_export: SystemExport, context?: SystemContext): SystemDeclaration => {
          const amd_execute: SystemExecute = (): void => {
            const amd_exports: SystemExports | undefined = amd_export(...amd_dep_exports);
            if (amd_exports !== undefined) {
              Object.assign(this.exports, amd_exports);
              this._export_object(this.exports);
              this._export_property("default", this.exports);
            }
            if (amd_name !== "") { console.log(`TODO: AMD named module "${amd_name}"`); }
          };
          return { setters: amd_setters, execute: amd_execute };
        };
        register(amd_deps, amd_declare);
      };
      (amd_define as any).amd = {};
      eval_args.set("define", amd_define);
    }

    const eval_func: string = `(function (${Array.from(eval_args.keys()).join(", ")}) { ${source}\n})\n//# sourceURL=${this.url}`;
    (0, eval)(eval_func)(...eval_args.values());

    for (const setter of this.setters) { setter(this.exports); }
    const { deps, declare } = registration;
    const _import: SystemImport = (id: string, parent_url: string = this.url): Promise<SystemExports> => this.loader.import(id, parent_url);
    const _export: SystemExport = (...args: any[]): any => {
      if (args.length === 1 && typeof args[0] === "object") { return this._export_object(args[0]); }
      if (args.length === 2 && typeof args[0] === "string") { return this._export_property(args[0], args[1]); }
      throw new Error(args.toString());
    }
    const resolve: SystemResolve = (id: string, parent_url: string = this.url): Promise<string> => this.loader.resolve(id, parent_url);
    const context: SystemContext = { id: this.url, import: _import, meta: { url: this.url, resolve } };
    const { setters, execute } = declare(_export, context);
    for (const [dep_index, dep_id] of deps.entries()) {
      const dep_url: string = await this.loader.resolve(dep_id, this.url);
      const dep_module: SystemModule = this.loader.registry.get(dep_url) || new SystemModule(this.loader, dep_url);
      this.dep_modules.add(dep_module);
      const dep_setter: SystemSetter | undefined = setters && setters[dep_index]; // setters match deps order
      if (dep_setter) { dep_module.setters.add(dep_setter); dep_setter(dep_module.exports); }
    }
    if (execute) { this.execute = execute; }
  }

  private async _link(): Promise<void> {
    if (this.execute !== null) { await this.execute.call(null); }
  }

  private _export_object(object: Record<string, any>): SystemExports {
    if (object.__esModule) { Object.defineProperty(this.exports, "__esModule", { enumerable: false, value: object.__esModule }); }
    let changed: boolean = false;
    for (const [key, value] of Object.entries(object)) {
      if (!(key in this.exports) || (this.exports[key] !== value)) {
        this.exports[key] = value;
        changed = true;
      }
    }
    if (changed) for (const setter of this.setters) { setter(this.exports); }
    return this.exports;
  }

  private _export_property<T>(key: string, value: T): T {
    if (!(key in this.exports) || (this.exports[key] !== value)) {
      this.exports[key] = value;
      for (const setter of this.setters) { setter(this.exports); }
    }
    return value;
  }

  public async process(): Promise<SystemExports> {
    await this._process_load(this.dep_load_done);
    await this._process_link(this.dep_link_done);
    return this.exports;
  }

  private async _process_load(dep_load_done: Set<string>): Promise<void> {
    if (dep_load_done.has(this.url)) { return; } dep_load_done.add(this.url);
    this.load_done = this.load_done || this._load(); await this.load_done; // before dependencies
    for (const dep_module of this.dep_modules) { await dep_module._process_load(dep_load_done); }
  }

  private async _process_link(dep_link_done: Set<string>): Promise<void> {
    if (dep_link_done.has(this.url)) { return; } dep_link_done.add(this.url);
    for (const dep_module of this.dep_modules) { await dep_module._process_link(dep_link_done); }
    this.link_done = this.link_done || this._link(); await this.link_done; // after dependencies
  }
}

class SystemLoader {
  private base_url: string = SystemLoader.__get_root_url();
  private readonly import_map: SystemImportMap = { imports: {}, scopes: {} };
  public readonly registry: Map<string, SystemModule> = new Map();
  
  private init_configs: Promise<void> = (async (): Promise<void> => {
    for (const config of await SystemLoader.__get_init_configs()) {
      this.config(config);
    }
  })();

  private init_modules: Promise<void> = (async (): Promise<void> => {
    for (const module_id of await SystemLoader.__get_init_module_ids()) {
      await this.import(module_id);
    }
  })();

  public config(config: Readonly<SystemConfiguration>): void {
    if (config.baseUrl) {
      this.base_url = SystemLoader._try_parse_url_like(config.baseUrl, SystemLoader.__get_root_url()) || this.base_url;
    }
    if (config.map) {
      SystemLoader._parse_import_map(config.map, this.base_url, this.import_map);
    }
  }

  public async import(id: string, parent_url: string = this.base_url): Promise<SystemExports> {
    const url: string = await this.resolve(id, parent_url);
    const module: SystemModule = this.registry.get(url) || new SystemModule(this, url);
    return module.process();
  }
  
  public async resolve(id: string, parent_url: string = this.base_url): Promise<string> {
    await this.init_configs;
    const import_map_url: string | undefined = SystemLoader._resolve_import_map(this.import_map, id, parent_url);
    if (import_map_url) {
      // console.log(`import map resolved "${id}" from "${parent_url}" to "${import_map_url}"`);
      return import_map_url;
    }
    const url: string | undefined = SystemLoader._try_parse_url(id, parent_url);
    if (url) {
      // console.log(`resolved "${id}" from "${parent_url}" to "${url}"`);
      return url;
    }
    throw new Error(`Cannot resolve "${id}" from ${parent_url}`);
  }

  // import maps

  // https://github.com/WICG/import-maps

  // https://github.com/open-wc/open-wc/blob/master/packages/import-maps-resolve/src/utils.js

  private static _try_parse_url(id: string, base_url?: string): string | undefined {
    try { return new URL(id, base_url).href; } catch (e) { return undefined; }
  }

  private static _try_parse_url_like(id: string, base_url: string): string | undefined {
    const is_path_like: boolean = id.startsWith("/") || id.startsWith("./") || id.startsWith("../");
    return is_path_like ? SystemLoader._try_parse_url(id, base_url) : SystemLoader._try_parse_url(id);
  }

  // https://github.com/open-wc/open-wc/blob/master/packages/import-maps-resolve/src/parser.js

  private static _parse_import_map(import_map: Readonly<Partial<SystemImportMap>>, base_url: string, out: SystemImportMap): SystemImportMap {
    SystemLoader._parse_scopes(import_map.scopes || {}, base_url, out.scopes);
    SystemLoader._parse_imports(import_map.imports || {}, base_url, out.imports);
    return out;
  }

  private static _parse_scopes(scopes: Readonly<SystemScopes>, base_url: string, out: SystemScopes): SystemScopes {
    for (const [scope_id, scope_imports] of Object.entries(scopes)) {
      const parsed_id: string = SystemLoader._try_parse_url(scope_id, base_url) || scope_id;
      const parsed_imports: SystemImports = SystemLoader._parse_imports(scope_imports, base_url, {});
      out[parsed_id] = parsed_imports;
    }
    return out;
  }

  private static _parse_imports(imports: Readonly<SystemImports>, base_url: string, out: SystemImports): SystemImports {
    for (const [import_id, import_url] of Object.entries(imports)) {
      const parsed_id: string = SystemLoader._try_parse_url_like(import_id, base_url) || import_id;
      const parsed_url: string = SystemLoader._try_parse_url_like(import_url, base_url) || import_url;
      out[parsed_id] = parsed_url;
    }
    return out;
  }

  // https://github.com/open-wc/open-wc/blob/master/packages/import-maps-resolve/src/resolver.js

  private static _resolve_import_map(map: Readonly<SystemImportMap>, id: string, parent_url: string): string | undefined {
    const url: string | undefined = SystemLoader._try_parse_url_like(id, parent_url);
    const matched_scope: string | undefined = SystemLoader._resolve_scopes(map.scopes, url || id, parent_url);
    if (matched_scope) { return matched_scope; }
    const matched_import: string | undefined = SystemLoader._resolve_imports(map.imports, url || id);
    if (matched_import) { return matched_import; }
    return url;
  }

  private static _resolve_scopes(scopes: Readonly<SystemScopes>, id: string, parent_url: string): string | undefined {
    for (const [scope_id, scope_imports] of Object.entries(scopes)) {
      if (parent_url.startsWith(scope_id) && scope_id.endsWith("/")) {
        const matched_import: string | undefined = SystemLoader._resolve_imports(scope_imports, id);
        if (matched_import) { return matched_import; }
      }
    }
    return undefined;
  }

  private static _resolve_imports(imports: Readonly<SystemImports>, id: string): string | undefined {
    for (const [import_id, import_url] of Object.entries(imports)) {
      // "@foo" -> {["@foo"]: "./abc/a.js"} -> "./abc/a.js"
      if (import_id === id) { return import_url; }

      // wildcard (*)
      // "@foo/a/bar/b" -> {["@foo/*/bar/*"]: "./abc/*/xyz/*.js"} -> "./abc/a/xyz/b.js"
      if (import_id.includes("*")) {
        const import_id_regex: RegExp = new RegExp(import_id.replace(/\./g, "\\.").replace(/\*/g, "(.+)"));
        const match: RegExpMatchArray | null = id.match(import_id_regex);
        if (match !== null) {
          let index: number = 1;
          const url: string = import_url.replace(/\*/g, (): string => match[index++]);
          // console.log(`${id} -> {[${import_id}]: ${import_url}} -> ${url}`);
          return url;
        }
      }

      // "@foo/a.js" -> {["@foo/"]: "./abc/"} -> "./abc/a.js"
      if (id.startsWith(import_id) && import_id.endsWith("/")) {
        const matched: string | undefined = SystemLoader._try_parse_url(id.substring(import_id.length), import_url);
        if (matched) { return matched; }
      }
    }
    return undefined;
  }

  // platform specific

  public static readonly PLATFORM: "browser" | "command" = (() => {
    if (typeof window !== "undefined") { return "browser"; }
    if (typeof process !== "undefined") { return "command"; }
    throw new Error("TODO: PLATFORM");
  })();

  public static __get_root_url(): string {
    switch (SystemLoader.PLATFORM) {
      default: throw new Error(`TODO: ${SystemLoader.PLATFORM} __get_root_url()`);
      case "browser": return new URL(location.pathname, location.origin).href;
      case "command": return require("url").pathToFileURL(`${process.cwd()}/`).href;
    }
  }

  public static async __load_text(url: string): Promise<string> {
    switch (SystemLoader.PLATFORM) {
      default: throw new Error(`TODO: ${SystemLoader.PLATFORM} __load_text(${url})`);
      case "browser": {
        const response: Response = await fetch(url);
        return await response.text();
      }
      case "command": {
        const filename: string = require("url").fileURLToPath(url);
        return await require("fs").promises.readFile(filename, "utf-8");
      }
    }
  }

  public static async __get_init_configs(): Promise<Set<Readonly<SystemConfiguration>>> {
    const configs: Set<Readonly<SystemConfiguration>> = new Set();
    switch (SystemLoader.PLATFORM) {
      default: throw new Error(`TODO: ${SystemLoader.PLATFORM} __get_init_configs()`);
      case "browser":
        for (const script of document.querySelectorAll("script")) {
          if (["importmap", "systemjs-importmap"].includes(script.type)) {
            if (script.src) {
              // <script type="systemjs-importmap" src="import-map.json"></script>
              const source: string = await SystemLoader.__load_text(script.src);
              configs.add({ map: JSON.parse(source) });
            }
            else {
              // <script type="systemjs-importmap">{ imports: { ... }, scopes: { ... } }</script>
              configs.add({ map: JSON.parse(script.innerHTML) });
            }
          }
        }
        break;
      case "command":
        // System.config({ ... });
        try {
          const url: string = require("path").resolve(process.cwd(), "system.config.js");
          const source: string = await SystemLoader.__load_text(url);
          const config: SystemConfigure = (config: Readonly<SystemConfiguration>): void => { configs.add(config); };
          (0, eval)(`(function (System) { ${source}\n})\n//# sourceURL=${url}`)({ config });
        } catch (err) { }
        // { baseUrl: "...", map: { imports: { ... }, scopes: { ... } } }
        try {
          const url: string = require("path").resolve(process.cwd(), "system.config.json");
          const source: string = await SystemLoader.__load_text(url);
          configs.add(JSON.parse(source));
        } catch (err) { }
        break;
    }
    return configs;
  }

  public static async __get_init_module_ids(): Promise<Set<string>> {
    const module_ids: Set<string> = new Set();
    switch (SystemLoader.PLATFORM) {
      default: throw new Error(`TODO: ${SystemLoader.PLATFORM} __get_init_module_ids()`);
      case "browser":
        for (const script of document.querySelectorAll("script")) {
          if (["module", "systemjs-module"].includes(script.type)) {
            const match: RegExpMatchArray | null = script.src.match(/^import:(.*)$/);
            if (match !== null) {
              // <script type="systemjs-module" src="import:foo"></script>
              module_ids.add(match[1]);
            }
          }
        }
        break;
      case "command":
        break;
    }
    return module_ids;
  }

  public static __require(id: string): SystemExports {
    switch (SystemLoader.PLATFORM) {
      default: throw new Error(`TODO: ${SystemLoader.PLATFORM} __require(${id})`);
      case "command": return require(id);
    }
  }
}

// global constructor
interface global { readonly SystemLoader: typeof SystemLoader; }
(<any>globalThis)["SystemLoader"] ||= SystemLoader;

// global instance
const System: SystemLoader = new SystemLoader();
interface global { readonly System: SystemLoader; }
(<any>globalThis)["System"] ||= System;
