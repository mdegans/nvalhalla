/* test_utils.gs
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


// These tests are kinda crap, but it's monday and I need caffiene

def _rm(filename:string)
	if GLib.FileUtils.test(filename, GLib.FileTest.EXISTS)
		f:GLib.File = GLib.File.new_for_path(filename)
		try
			f.delete()
		except err:GLib.Error
			warning(@"_rm failed because: $(err.message)")

def test_sync_copy_file(delete_before:bool)
	// this test should be run twice, once with true as an arg and once with false

	// two temporary filenames
	fn1:string = "tmp_test_sync_copy_file_1"
	fn2:string = "tmp_test_sync_copy_file_2"

	if delete_before
		_rm(fn1)
		_rm(fn2)

	// create a File objet for the new file
	// (a GLib.File is a lazy wrapper, this does not open the file)
	f1:GLib.File = GLib.File.new_for_path(fn1)
	try
		// create the file
		ostream:GLib.FileOutputStream = f1.create(GLib.FileCreateFlags.NONE)
		if not ostream.is_closed()
			ostream.close()
	except err:GLib.Error
		if not delete_before and err.code == 2
			// this tests if err is thrown if a file already exists
			return
		error(@"sync_copy_file failed because:$(err.code):$(err.message)")
	try
		NValhalla.Utils.sync_copy_file(fn1, fn2, null)
	except err:GLib.Error
		warning(@"sync_copy_file threw error:$(err.code):$(err.message)")
		return
	if not GLib.FileUtils.test(fn2, GLib.FileTest.EXISTS)
		error(@"$fn2 does not exist. test_sync_copy_file failed")


def test_mkdirs()
	path:string = "/tmp/nvalhalla-test-mkdirs/foo/bar"
	if GLib.FileUtils.test(path, GLib.FileTest.EXISTS)
		f:GLib.File = GLib.File.new_for_path(path)
		try
			f.delete()
		except err:GLib.Error
			warning (@"could not complete test_mkdirs because: $(err.message)")
			return
	try
		NValhalla.Utils.mkdirs(path)
	except err:GLib.FileError
		warning(@"could not create paths because: $(err.message)")
	if not GLib.FileUtils.test(path, GLib.FileTest.EXISTS)
		error(@"$path does not exist. test_mkdirs failed")


def test_signal_handler()
	// TODO(mdegans): cover this, but if it breaks it's pretty obvious
	warning("SignalHandler not covered")

init
	test_sync_copy_file(true)
	test_sync_copy_file(true)
	test_sync_copy_file(false)
	test_sync_copy_file(false)
	test_mkdirs()
	test_signal_handler()
