/* main.gs
 *
 * Copyright 2020 Michael de Gans
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


init
	// global setup
	NValhalla.Setup.setup()
	// create an argument parser
	var ap = new NValhalla.ArgumentParser("NValhalla live redaction demo")
	// "args" is an array of string (command line arguments) supplied to init 
	// (main() in C)
	var parsed_args = ap.parse_args(args)
	// create the app instance
	var app = new NValhalla.App(parsed_args, null)
	// attach a signal handler that will call quit() on the app
	// valac compplains that `handler` isn't used but it's wrong.
	// TODO(mdegans): rethink design so valac shuts up.
	//  Handler as a function instead, or a .register(app) method?
	//  There is no way to suppress warnings with valac since it's assumed
	//  the compiler is always right, and it probably is.
	var handler = new NValhalla.Utils.SignalHandler(app)
	// run the app
	app.run()
