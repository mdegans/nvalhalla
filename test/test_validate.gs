/* test_validate.gs
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

[indent = 0]

def test_sink_type()
	good:array of string = {
		"screen", "rtsp", "youtube"
	}
	bad:array of string = {
		"potato"
	}
	if not NValhalla.Validate.sink_type(null)
		error("NULL should be a valid sink type but sink_type() returned false")
	for s in good
		if not NValhalla.Validate.sink_type(s)
			error(@"$s should be a valid sink type but sink_type() returned false")
	for s in bad
		if NValhalla.Validate.sink_type(s)
			error(@"$s validated as a sink type but shouldn't have")

def test_uri()
	good:array of string = {
		"https://www.google.com/",
		"rtsp://192.168.1.123/somepath"
	}
	bad:array of string = {
		"potato potahtoe"
	}
	for u in good
		if not NValhalla.Validate.uri(u)
			error(@"'$u' is a valid uri but uri() returned false")
	for u in bad
		if NValhalla.Validate.uri(u)
			error(@"'$u' validated as a uri but shouldn't have")

init
	test_sink_type()
	test_uri()
