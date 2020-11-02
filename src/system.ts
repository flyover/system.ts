//
// Copyright (c) Flyover Games, LLC
//

interface SystemConfig {
  readonly baseUrl?: string;
  readonly map?: Partial<SystemImportMap>;
}

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
  setters: SystemSetter[];
  execute: SystemExecute;
}

type SystemSetter = (exports: SystemExports) => void;

type SystemExecute = () => void | Promise<void>;

interface SystemContext {
  id: string;
  import: SystemImport;
  meta?: SystemMeta;
}

type SystemImport = (id: string) => Promise<SystemExports>;

type SystemExport = SystemExportObject | SystemExportProperty;
type SystemExportObject = (exports: Record<string, any>) => SystemExports;
type SystemExportProperty = <T>(key: string, value: T) => typeof value;

interface SystemMeta {
  url: string;
  resolve: SystemResolve;
}

type SystemResolve = (id: string) => string;

class SystemModule {
  public readonly dep_modules: Set<SystemModule> = new Set(); // dependent modules
  public load: (() => Promise<void>) | null = null;
  public link: (() => Promise<void>) | null = null;
  public execute: SystemExecute | null = null;
  public readonly setters: Set<SystemSetter> = new Set(); // setters for modules dependent on this module
  public readonly exports: SystemExports = Object.create(null);

  public constructor(public readonly url: string) {
    Object.defineProperty(this.exports, Symbol.toStringTag, { value: "Module" });
  }
}

class SystemLoader {
  private done_config: boolean = false;
  private base_url: string = SystemLoader.__get_root_url();
  private readonly import_map: SystemImportMap = { imports: {}, scopes: {} };
  private readonly registry: Map<string, SystemModule> = new Map();

  public config(config: Readonly<SystemConfig>): void {
    if (!this.done_config) { this.done_config = true; }
    if (config.baseUrl) {
      this.base_url = SystemLoader._try_parse_url_like(config.baseUrl, SystemLoader.__get_root_url()) || this.base_url;
    }
    if (config.map) {
      SystemLoader._parse_import_map(config.map, this.base_url, this.import_map);
    }
  }

  public async import(id: string): Promise<SystemExports> {
    if (!this.done_config) {
      this.done_config = true;
      for (const config of await SystemLoader.__init_config()) { this.config(config); }
    }
    return this._import_module(id, this.base_url);
  }

  private async _import_module(id: string, parent_url: string): Promise<SystemExports> {
    const url: string = this._resolve_url(id, parent_url);
    const module: SystemModule = this.registry.get(url) || this._make_module(url);
    await SystemLoader._load_module(module, {});
    await SystemLoader._link_module(module, {});
    return module.exports;
  }

  private _resolve_url(id: string, parent_url: string): string {
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

  private _make_module(url: string): SystemModule {
    const module: SystemModule = new SystemModule(url);
    this.registry.set(url, module);

    module.load = async (): Promise<void> => {
      const text: string = await SystemLoader.__load_text(url);
      let registration: SystemRegistration = { deps: [], declare: () => ({ setters: [], execute: (): void => { } }) };
      const register: SystemRegister = (deps: string[], declare: SystemDeclare): void => { registration = { deps, declare }; };
      (0, eval)(`(function (System, module, exports) { ${text} })\n//# sourceURL=${module.url}`)({ register }, module, module.exports);
      const { deps, declare } = registration;
      const _import: SystemImport = (id: string): Promise<SystemExports> => this._import_module(id, url);
      const _export: SystemExport = (...args: any[]): any => {
        if (args.length === 1 && typeof args[0] === "object") {
          const exports: Record<string, any> = args[0];
          let changed: boolean = false;
          for (const [key, value] of Object.entries(exports)) {
            if (!(key in module.exports) || (module.exports[key] !== value)) {
              module.exports[key] = value;
              changed = true;
            }
          }
          if (changed) for (const setter of module.setters) { setter(module.exports); }
          return module.exports;
        }
        if (args.length === 2 && typeof args[0] === "string") {
          const key: string = args[0];
          const value: any = args[1];
          if (!(key in module.exports) || (module.exports[key] !== value)) {
            module.exports[key] = value;
            for (const setter of module.setters) { setter(module.exports); }
          }
          return value;
        }
        throw new Error(args.toString());
      }
      const resolve: SystemResolve = (id: string): string => this._resolve_url(id, url);
      const context: SystemContext = { id: url, import: _import, meta: { url, resolve } };
      const { setters, execute } = declare(_export, context);
      for (const [dep_index, dep_id] of deps.entries()) {
        const dep_url: string = this._resolve_url(dep_id, url);
        const dep_module: SystemModule = this.registry.get(dep_url) || this._make_module(dep_url);
        const dep_setter: SystemSetter = setters[dep_index]; // setters match deps order
        dep_module.setters.add(dep_setter);
        module.dep_modules.add(dep_module);
        dep_setter(dep_module.exports);
      }
      module.execute = execute;
    };

    module.link = async (): Promise<void> => {
      if (module.execute !== null) { await module.execute.call(null); }
    };

    return module;
  }

  private static async _load_module(module: SystemModule, done: { [key: string]: boolean }): Promise<void> {
    if (done[module.url]) { return; } done[module.url] = true;
    const load = module.load; module.load = null; if (load !== null) { await load(); } // before dependencies
    for (const dep_module of module.dep_modules) { await SystemLoader._load_module(dep_module, done); }
  }

  private static async _link_module(module: SystemModule, done: { [key: string]: boolean }): Promise<void> {
    if (done[module.url]) { return; } done[module.url] = true;
    for (const dep_module of module.dep_modules) { await SystemLoader._link_module(dep_module, done); }
    const link = module.link; module.link = null; if (link !== null) { await link(); } // after dependencies
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

  private static readonly PLATFORM: "browser" | "command" = (() => {
    if (typeof window !== "undefined") { return "browser"; }
    if (typeof process !== "undefined") { return "command"; }
    throw new Error("TODO: PLATFORM");
  })();

  private static __get_root_url(): string {
    switch (SystemLoader.PLATFORM) {
      default: throw new Error(`TODO: ${SystemLoader.PLATFORM} __get_root_url()`);
      case "browser": return new URL(location.pathname, location.origin).href;
      case "command": return require("url").pathToFileURL(`${process.cwd()}/`).href;
    }
  }

  private static async __load_text(url: string): Promise<string> {
    switch (SystemLoader.PLATFORM) {
      default: throw new Error(`TODO: ${SystemLoader.PLATFORM} __load_text(${url})`);
      case "browser": {
        const response: Response = await fetch(url);
        return await response.text();
      }
      case "command": {
        const filename: string = require("url").fileURLToPath(url);
        return await require("fs/promises").readFile(filename, "utf-8");
      }
    }
  }

  private static async __init_config(): Promise<Set<Readonly<SystemConfig>>> {
    const configs: Set<Readonly<SystemConfig>> = new Set();
    switch (SystemLoader.PLATFORM) {
      default: throw new Error(`TODO: ${SystemLoader.PLATFORM} __init_config()`);
      case "browser":
        for (const script of document.querySelectorAll("script")) {
          if (["importmap", "systemjs-importmap"].includes(script.type)) {
            if (script.src) {
              // <script src="import-map.json"></script>
              const text: string = await SystemLoader.__load_text(script.src);
              configs.add({ map: JSON.parse(text) });
            }
            else {
              // <script>{ imports: { ... }, scopes: { ... } }</script>
              configs.add({ map: JSON.parse(script.innerHTML) });
            }
          }
        }
        break;
      case "command":
        // System.config({ ... });
        try {
          const url: string = require("path").resolve(process.cwd(), "system.config.js");
          const text: string = await SystemLoader.__load_text(url);
          const config = (config: Readonly<SystemConfig>): void => { configs.add(config); };
          (0, eval)(`(function (System) { ${text} })\n//# sourceURL=${url}`)({ config });
        } catch (err) { }
        // { imports: { ... }, scopes: { ... } }
        try {
          const url: string = require("path").resolve(process.cwd(), "system.config.json")
          const text: string = await SystemLoader.__load_text(url);
          configs.add(JSON.parse(text));
        } catch (err) { }
        break;
    }
    return configs;
  }
}

// global instance

interface global { readonly System: SystemLoader; }
(<any>globalThis)["System"] = new SystemLoader();

// global constructor

interface global { readonly SystemLoader: typeof SystemLoader; }
(<any>globalThis)["SystemLoader"] = SystemLoader;
