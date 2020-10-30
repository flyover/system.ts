"use strict";
//
// Copyright (c) Flyover Games, LLC
//
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
class SystemModule {
    constructor(url) {
        this.url = url;
        this.dep_modules = new Set(); // dependent modules
        this.load = null;
        this.link = null;
        this.execute = null;
        this.setters = new Set(); // setters for modules dependent on this module
        this.exports = Object.create(null);
        Object.defineProperty(this.exports, Symbol.toStringTag, { value: "Module" });
    }
}
class SystemLoader {
    constructor() {
        this.done_config = false;
        this.base_url = SystemLoader.__get_root_url();
        this.import_map = { imports: {}, scopes: {} };
        this.registry = new Map();
        this.register = null;
    }
    config(config) {
        if (!this.done_config) {
            this.done_config = true;
        }
        if (config.baseUrl) {
            this.base_url = SystemLoader._try_parse_url_like(config.baseUrl, SystemLoader.__get_root_url()) || this.base_url;
        }
        if (config.map) {
            SystemLoader._parse_import_map(config.map, this.base_url, this.import_map);
        }
    }
    import(id) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.done_config) {
                this.done_config = true;
                yield SystemLoader.__init_config();
            }
            return this._import_module(id, this.base_url);
        });
    }
    _import_module(id, parent_url) {
        return __awaiter(this, void 0, void 0, function* () {
            const url = this._resolve_url(id, parent_url);
            const module = this.registry.get(url) || this._make_module(url);
            yield SystemLoader._load_module(module, {});
            yield SystemLoader._link_module(module, {});
            return module.exports;
        });
    }
    _resolve_url(id, parent_url) {
        const import_map_url = SystemLoader._resolve_import_map(this.import_map, id, parent_url);
        if (import_map_url) {
            // console.log(`import map resolved "${id}" from "${parent_url}" to "${import_map_url}"`);
            return import_map_url;
        }
        const url = SystemLoader._try_parse_url(id, parent_url);
        if (url) {
            // console.log(`resolved "${id}" from "${parent_url}" to "${url}"`);
            return url;
        }
        throw new Error(`Cannot resolve "${id}" from ${parent_url}`);
    }
    _make_module(url) {
        const module = new SystemModule(url);
        this.registry.set(url, module);
        module.load = () => __awaiter(this, void 0, void 0, function* () {
            let registration = { deps: [], declare: () => { throw new Error("System.register"); } };
            const save_register = System.register;
            System.register = (deps, declare) => { registration = { deps, declare }; };
            yield SystemLoader.__load_script(url); // calls System.register
            System.register = save_register;
            const { deps, declare } = registration;
            const _import = (id) => this._import_module(id, url);
            const _export = (...args) => {
                if (args.length === 1 && typeof args[0] === "object") {
                    const exports = args[0];
                    let changed = false;
                    for (const [key, value] of Object.entries(exports)) {
                        if (!(key in module.exports) || (module.exports[key] !== value)) {
                            module.exports[key] = value;
                            changed = true;
                        }
                    }
                    if (changed)
                        for (const setter of module.setters) {
                            setter(module.exports);
                        }
                    return module.exports;
                }
                if (args.length === 2 && typeof args[0] === "string") {
                    const key = args[0];
                    const value = args[1];
                    if (!(key in module.exports) || (module.exports[key] !== value)) {
                        module.exports[key] = value;
                        for (const setter of module.setters) {
                            setter(module.exports);
                        }
                    }
                    return value;
                }
                throw new Error(args.toString());
            };
            const resolve = (id) => this._resolve_url(id, url);
            const context = { id: url, import: _import, meta: { url, resolve } };
            const { setters, execute } = declare(_export, context);
            for (const [dep_index, dep_id] of deps.entries()) {
                const dep_url = this._resolve_url(dep_id, url);
                const dep_module = this.registry.get(dep_url) || this._make_module(dep_url);
                const dep_setter = setters[dep_index]; // setters match deps order
                dep_module.setters.add(dep_setter);
                module.dep_modules.add(dep_module);
                dep_setter(dep_module.exports);
            }
            module.execute = execute;
        });
        module.link = () => __awaiter(this, void 0, void 0, function* () {
            if (module.execute !== null) {
                yield module.execute.call(null);
            }
        });
        return module;
    }
    static _load_module(module, done) {
        return __awaiter(this, void 0, void 0, function* () {
            if (done[module.url]) {
                return;
            }
            done[module.url] = true;
            const load = module.load;
            module.load = null;
            if (load !== null) {
                yield load();
            } // before dependencies
            for (const dep_module of module.dep_modules) {
                yield SystemLoader._load_module(dep_module, done);
            }
        });
    }
    static _link_module(module, done) {
        return __awaiter(this, void 0, void 0, function* () {
            if (done[module.url]) {
                return;
            }
            done[module.url] = true;
            for (const dep_module of module.dep_modules) {
                yield SystemLoader._link_module(dep_module, done);
            }
            const link = module.link;
            module.link = null;
            if (link !== null) {
                yield link();
            } // after dependencies
        });
    }
    // import maps
    // https://github.com/WICG/import-maps
    // https://github.com/open-wc/open-wc/blob/master/packages/import-maps-resolve/src/utils.js
    static _try_parse_url(id, base_url) {
        try {
            return new URL(id, base_url).href;
        }
        catch (e) {
            return undefined;
        }
    }
    static _try_parse_url_like(id, base_url) {
        const is_path_like = id.startsWith("/") || id.startsWith("./") || id.startsWith("../");
        return is_path_like ? SystemLoader._try_parse_url(id, base_url) : SystemLoader._try_parse_url(id);
    }
    // https://github.com/open-wc/open-wc/blob/master/packages/import-maps-resolve/src/parser.js
    static _parse_import_map(import_map, base_url, out) {
        SystemLoader._parse_scopes(import_map.scopes || {}, base_url, out.scopes);
        SystemLoader._parse_imports(import_map.imports || {}, base_url, out.imports);
        return out;
    }
    static _parse_scopes(scopes, base_url, out) {
        for (const [scope_id, scope_imports] of Object.entries(scopes)) {
            const parsed_id = SystemLoader._try_parse_url(scope_id, base_url) || scope_id;
            const parsed_imports = SystemLoader._parse_imports(scope_imports, base_url, {});
            out[parsed_id] = parsed_imports;
        }
        return out;
    }
    static _parse_imports(imports, base_url, out) {
        for (const [import_id, import_url] of Object.entries(imports)) {
            const parsed_id = SystemLoader._try_parse_url_like(import_id, base_url) || import_id;
            const parsed_url = SystemLoader._try_parse_url_like(import_url, base_url) || import_url;
            out[parsed_id] = parsed_url;
        }
        return out;
    }
    // https://github.com/open-wc/open-wc/blob/master/packages/import-maps-resolve/src/resolver.js
    static _resolve_import_map(map, id, parent_url) {
        const url = SystemLoader._try_parse_url_like(id, parent_url);
        const matched_scope = SystemLoader._resolve_scopes(map.scopes, url || id, parent_url);
        if (matched_scope) {
            return matched_scope;
        }
        const matched_import = SystemLoader._resolve_imports(map.imports, url || id);
        if (matched_import) {
            return matched_import;
        }
        return url;
    }
    static _resolve_scopes(scopes, id, parent_url) {
        for (const [scope_id, scope_imports] of Object.entries(scopes)) {
            if (parent_url.startsWith(scope_id) && scope_id.endsWith("/")) {
                const matched_import = SystemLoader._resolve_imports(scope_imports, id);
                if (matched_import) {
                    return matched_import;
                }
            }
        }
        return undefined;
    }
    static _resolve_imports(imports, id) {
        for (const [import_id, import_url] of Object.entries(imports)) {
            // "@foo" -> {["@foo"]: "./abc/a.js"} -> "./abc/a.js"
            if (import_id === id) {
                return import_url;
            }
            // wildcard (*)
            // "@foo/a/bar/b" -> {["@foo/*/bar/*"]: "./abc/*/xyz/*.js"} -> "./abc/a/xyz/b.js"
            if (import_id.includes("*")) {
                const import_id_regex = new RegExp(import_id.replace(/\./g, "\\.").replace(/\*/g, "(.+)"));
                const match = id.match(import_id_regex);
                if (match !== null) {
                    let index = 1;
                    const url = import_url.replace(/\*/g, () => match[index++]);
                    // console.log(`${id} -> {[${import_id}]: ${import_url}} -> ${url}`);
                    return url;
                }
            }
            // "@foo/a.js" -> {["@foo/"]: "./abc/"} -> "./abc/a.js"
            if (id.startsWith(import_id) && import_id.endsWith("/")) {
                const matched = SystemLoader._try_parse_url(id.substring(import_id.length), import_url);
                if (matched) {
                    return matched;
                }
            }
        }
        return undefined;
    }
    static __get_root_url() {
        switch (SystemLoader.PLATFORM) {
            default: throw new Error(`TODO: ${SystemLoader.PLATFORM} __get_root_url()`);
            case "browser": return new URL(location.pathname, location.origin).href;
            case "command": return require("url").pathToFileURL(`${process.cwd()}/`).href;
        }
    }
    static __load_script(url) {
        return __awaiter(this, void 0, void 0, function* () {
            switch (SystemLoader.PLATFORM) {
                default: throw new Error(`TODO: ${SystemLoader.PLATFORM} __load_script(${url})`);
                case "browser":
                    yield new Promise((resolve, reject) => {
                        const script = document.head.appendChild(document.createElement("script"));
                        script.addEventListener("error", reject);
                        script.addEventListener("load", resolve);
                        script.async = true;
                        script.src = url;
                    });
                    break;
                case "command":
                    yield new Promise((resolve, reject) => {
                        const path = require("url").fileURLToPath(url);
                        require("fs").readFile(path, "utf-8", (err, code) => {
                            if (err) {
                                reject(err);
                            }
                            else {
                                require("vm").runInThisContext(code, { filename: url });
                                resolve();
                            }
                        });
                    });
                    break;
            }
        });
    }
    static __init_config() {
        return __awaiter(this, void 0, void 0, function* () {
            switch (SystemLoader.PLATFORM) {
                default: throw new Error(`TODO: ${SystemLoader.PLATFORM} __init_config()`);
                case "browser":
                    for (const script of document.querySelectorAll("script")) {
                        if (script.type === "systemjs-importmap") {
                            if (script.src) {
                                // <script src="import-map.json"></script>
                                const response = yield fetch(script.src);
                                System.config({ map: JSON.parse(yield response.json()) });
                            }
                            else {
                                // <script>{ imports: { ... }, scopes: { ... } }</script>
                                System.config({ map: JSON.parse(script.innerHTML) });
                            }
                        }
                    }
                    break;
                case "command":
                    // System.config({ ... });
                    try {
                        module.require(require("path").resolve(process.cwd(), "system.config.js"));
                    }
                    catch (err) { }
                    // { imports: { ... }, scopes: { ... } }
                    try {
                        System.config(JSON.parse(require("path").resolve(process.cwd(), "system.config.json")));
                    }
                    catch (err) { }
                    break;
            }
        });
    }
}
// platform specific
SystemLoader.PLATFORM = (() => {
    if (typeof window !== "undefined") {
        return "browser";
    }
    if (typeof process !== "undefined") {
        return "command";
    }
    throw new Error("TODO: PLATFORM");
})();
// global instance
const System = new SystemLoader();
globalThis["System"] = System;
//# sourceMappingURL=system.js.map