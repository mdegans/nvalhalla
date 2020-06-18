/* setup.gs
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

namespace NValhalla.Setup

	// These two strings the build system will replace with configure_file
	const VERSION:string = "@version@"
	const PREFIX:string = "@prefix@"
	const MODEL_DIR:string = PREFIX + "/share/nvalhalla/models"
	const NVINFER_CONFIG_DIR:string = PREFIX + "/share/nvalhalla/nvinfer_configs"
	const SCRIPTS_DIR:string = PREFIX + "/share/nvalhalla/scripts"
	const DOT_TO_PDF_BASENAME:string = "dot_to_pdf.sh"
	const DOT_TO_PDF_ORIGIN:string = SCRIPTS_DIR + "/" + DOT_TO_PDF_BASENAME

	/**
	 * Create and/or return a ''user'' app dir (~/.nvalhalla)
	 *
	 * @return an absolute path
	 * @throws GLib.FileError.FAILED on failure to create directory
	 */
	def nvalhalla_dir():string raises GLib.FileError
		// TODO(mdegans): handle system user case with no homedir
		dir:string = GLib.Path.build_filename(GLib.Environment.get_home_dir(), ".nvalhalla")
		NValhalla.Utils.mkdirs(dir)
		return dir

	/**
	 * Create and/or return a ''user'' configs dir (~/.nvalhalla/configs)
	 *
	 * @return an absolute path
	 * @throws GLib.FileError.FAILED on failure to create directory
	 */
	def config_dir():string raises GLib.FileError
		dir:string = GLib.Path.build_filename(nvalhalla_dir(), "configs")
		NValhalla.Utils.mkdirs(dir)
		return dir

	/**
	 * Create and/or return a ''user'' meta dir (~/.nvalhalla/meta)
	 *
	 * @return an absolute path
	 * @throws GLib.FileError.FAILED on failure to create directory
	 */
	def meta_dir():string raises GLib.FileError
		dir:string = GLib.Path.build_filename(nvalhalla_dir(), "meta")
		NValhalla.Utils.mkdirs(dir)
		return dir

	/**
	 * Create and/or return a ''user'' model dir (~/.nvalhalla/models)
	 *
	 * @return an absolute path
	 * @throws GLib.FileError.FAILED on failure to create directory
	 */
	def model_dir():string raises GLib.FileError
		dir:string = GLib.Path.build_filename(nvalhalla_dir(), "models")
		NValhalla.Utils.mkdirs(dir)
		return dir

	/**
	 * Setup a .dot dump dir (~/.nvalhalla/dot)
	 *
	 * * create ~/.nvalhalla/dot if it doesn't already exist
	 * * set the GST_DEBUG_DUMP_DOT_DIR environment variable to the dir if it is
	 * not already set.
	 * * copy a pdf conversion script into the folder if one doens't already 
	 * exist
	 *
	 * @return an absolute path
	 * @throws GLib.FileError.FAILED on failure to create directory
	 * @throws GLib.Error on failure to copy a file
	 */
	def dot_dir():string raises GLib.FileError, GLib.Error
		dir:string = GLib.Path.build_filename(nvalhalla_dir(), "dot")
		NValhalla.Utils.mkdirs(dir)
		GLib.Environment.set_variable("GST_DEBUG_DUMP_DOT_DIR", dir, false)
		dot_to_pdf_dest:string = GLib.Path.build_filename(dir, DOT_TO_PDF_BASENAME)
		if not GLib.FileUtils.test(dot_to_pdf_dest, GLib.FileTest.EXISTS)
			NValhalla.Utils.sync_copy_file(DOT_TO_PDF_ORIGIN, dot_to_pdf_dest, null)
		return dir

	/**
	 * Setup environment variables and user config dirs.
	 */
	def static setup()
		// set the environment variable to dump dot files ~/.nvalhalla if not 
		// already defined
		try
			dot_dir()
			config_dir()
			model_dir()
		except err:FileError
			error("NValhalla path setup failed because: %s\n", err.message)
		except err:Error
			error("NValhalla setup failed because: %s\n", err.message)
