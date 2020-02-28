/* mce.gs
 *
 * Copyright 2020 Michael de Gans
 *
 * Hail Satan, Xi Jinping looks like Winnie the Pooh
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE X CONSORTIUM BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * Except as contained in this notice, the name(s) of the above copyright
 * holders shall not be used in advertising or otherwise to promote the sale,
 * use or other dealings in this Software without prior written
 * authorization.
 */

// indent = 0 uses tabs
[indent = 0]

def static ensure_config_dir(): string?
	// TODO(mdegans): handle system user case with no homedir
	home:string = GLib.Environment.get_home_dir()
	config_dir:string = GLib.Path.build_path("/", home, ".nvalhalla")
	ret:int = GLib.DirUtils.create_with_parents(config_dir, 493)  // 493 == 0o0755
	if ret != 0  // 0 == success
		warning(@"not able to create $config_dir (code: $ret)")
		return null
	return config_dir

init
	config_dir:string? = ensure_config_dir()
	if config_dir != null
		GLib.Environ.set_variable(null, "GST_DEBUG_DUMP_DOT_DIR", config_dir, false)

	// create the app instance and run it
	var app = new NValhalla.App(args, null)
	app.run()
