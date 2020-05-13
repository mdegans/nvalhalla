/* bins.gs
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

//  def static plugin_init(plugin:Gst.Plugin): bool
//  	Gst.Element.register(plugin, "nvredact", Gst.Rank.NONE, typeof(NValhalla.Bins.Redactor))
//  	return true

// TODO: mdegans: figure out hwo to fix error: Value must be constant
//  const gst_plugin_desc:Gst.PluginDesc = Gst.PluginDesc() {
//  	description = "NValhalla Handy Bins",
//  	license = "MIT",
//  	major_version = 0,
//  	minor_version = 1,
//  	name = "nvalhalla_bins",
//  	origin = "SOVNGARDE!",
//  	package = "nvalhalla",
//  	plugin_init = (Gst.PluginInitFunc) plugin_init,
//  	release_datetime = "02/27/2020",
//  	source = "https://github.com/mdegans/nvalhalla",
//  	version = "0.1"
//  }

// buffer callbacks from cb_buffer.h
def extern on_buffer_osd_redact(pad:Gst.Pad, info:Gst.PadProbeInfo): Gst.PadProbeReturn

namespace NValhalla.Bins

	// TODO(mdegans): consider separating redaction and tiling
	/**
	 * A {@link Gst.Bin} that redacts and tiles multiple video streams. it:
	 *
	 * * has static ghost pads and can be linked with {@link Gst.Element.link}.
	 * * expects a nvstreammux before and some kind of sink after.
	 * * It's string approximation would be:
	 * "nvinfer ! nvmultistreamtiler ! nvvideoconvert ! nvdsosd".
	 */
	class Redactor:Gst.Bin

		// constants needed by the redactor
		const CONFIG_BASENAME:string = "redactor.ini"
		const MODEL_BASENAME:string = "redactor.caffemodel"
		const PROTO_BASENAME:string = "redactor.prototxt"
		const LABEL_BASENAME:string = "redactor_labels.txt"

		/** primary nvinfer engine */
		pie:dynamic Gst.Element

		/** tracker element to avoid repeated inferences */
		tracker:dynamic Gst.Element

		/** nvmultistreamtiler to tile the multiple streams */
		tiler:dynamic Gst.Element

		/** nvvideoconvert for the osd */
		osdconv:Gst.Element

		/** nvdsosd to draw boxes */
		osd:Gst.Element

		/**
		 * Read only partial config for the primary inference engine.
		 *
		 * ''Note:'' for now this only contains the config-file-path.
		 */
		prop readonly config:dict of string,string

		/** the pad probe id for the buffer callback */
		prop readonly probe_id:ulong

		/**
		 * ''get'' the {@link pie} ''batch-size''
		 *
		 * ''set'' the {@link pie} ''batch-size'' and ''model-engine-file'' 
		 * property, and ''set'' the {@link tiler} ''rows'' and ''columns''
		 * to their ideal values.
		 *
		 * Usually this should be set to the number of sources.
		 */
		prop batch_size:int
			get
				return self.pie.batch_size
			set
				if value < 1
					warning("batch_size may not be < 1. Setting to 1.")
					value = 1
				try
					dest_dir:string = NValhalla.Setup.model_dir()
					// TODO(mdegans): dynamically set precision
					gpu_id:int = 0;
					self.pie.get("gpu-id", ref gpu_id)
					basename:string = @"redaction_b$(value)_gpu$(gpu_id)_fp32.engine"
					self.pie.model_engine_file = GLib.Path.build_filename(dest_dir, basename)
				except err:FileError
					warning(@"could not set model-engine-file on pie because: $(err.message)")
				// calculate the number of columns and rows required:
				rows_and_columns:int = (int) Math.ceilf(Math.sqrtf((float) value))
				self.tiler.set_property("rows", rows_and_columns)
				self.tiler.set_property("columns", rows_and_columns)
				self.pie.batch_size = value

		/**
		 * set/get the output width
		 */
		prop width:int
			get
				return self.tiler.width
			set
				self.tiler.width = value

		/**
		 * set/get the output height
		 */
		prop height:int
			get
				return self.tiler.height
			set
				self.tiler.height = value

		/**
		 * construct a new Redactor {@link Gst.Bin}
		 *
		 * @param name a name for this or null for no name
		 */
		construct(name:string?)
			try
				_config = setup()
			except err:Error
				// TODO: recover from failed setup with some fallback
				error("Redactor setup failed because: %s\n", err.message)
			if name != null
				self.name = name

			// create and add the primary inference element
			self.pie = Gst.ElementFactory.make("nvinfer", "pie")
			if self.pie == null or not self.add(self.pie)
				error(@"$(self.name) failed to create or add nvinfer element")
			for var entry in _config.entries
				self.pie.set_property(entry.key, entry.value)

			// set up the tracker element
			self.tracker = Gst.ElementFactory.make("nvtracker", "tracker")
			if self.tracker == null or not self.add(self.tracker)
				error("could not create or add tracker element")
			self.tracker.set_property("ll-lib-file", "libnvds_mot_iou.so")
			self.tracker.set_property("enable-batch-process", true)

			// set up the multi-stream tiler
			self.tiler = Gst.ElementFactory.make("nvmultistreamtiler", "tiler")
			if self.tiler == null or not self.add(self.tiler)
				error("could not create or add stream tiler")
			self.width = NValhalla.App.WIDTH
			self.height = NValhalla.App.HEIGHT

			// create the converter element
			self.osdconv = Gst.ElementFactory.make("nvvideoconvert", "osdconv")
			if self.osdconv == null or not self.add(self.osdconv)
				error(@"$(self.name) failed to create or add nvvideoconvert element")

			// create the osd element
			self.osd = Gst.ElementFactory.make("nvdsosd", "osd")
			if self.osd == null or not self.add(self.osd)
				error(@"$(self.name) failed to create or add nvdsosd element")

			// link all elements
			if not self.pie.link_many(self.tracker, self.tiler, self.osdconv, self.osd)
				error(@"$(self.name) faild to link nvinfer ! nvtracker ! nvmultistreamtiler ! nvvideoconvert ! nvdsosd")

			// connect the buffer callback to the sink pad
			osd_sink_pad:Gst.Pad? = self.osd.get_static_pad("sink")
			if osd_sink_pad == null
				error(@"$(self.name) failed to get osd sink pad")
			self._probe_id = osd_sink_pad.add_probe(Gst.PadProbeType.BUFFER, on_buffer_osd_redact)

			// ghost (proxy) inner pads to outer pads, since pads have to be on
			// the same hierarchy in order to be linked (can't an pad inside one
			// bin to an pad outside, or in another bin)
			// TODO(mdegans): refactor, perhaps move some of this to a superclass
			pie_sink_pad:Gst.Pad? = self.pie.get_static_pad("sink")
			if pie_sink_pad == null
				error(@"$(self.name) could not get sink pad from $(self.pie.name)")
			sink_pad:Gst.GhostPad = new Gst.GhostPad.from_template("sink", pie_sink_pad, pie_sink_pad.padtemplate)
			if sink_pad == null
				error(@"$(self.name) could not create ghost sink pad from $(self.pie.name)")
			if not self.add_pad(sink_pad)
				error(@"could not add $(sink_pad.name) ghost pad to $(self.name)")
			// do the same with the source pad
			osd_src_pad:Gst.Pad? = self.osd.get_static_pad("src")
			if osd_src_pad == null
				error(@"$(self.name) could not get src pad from $(self.osd.name)")
			src_pad:Gst.GhostPad = new Gst.GhostPad.from_template("src", osd_src_pad, osd_src_pad.padtemplate)
			if src_pad == null
				error(@"$(self.name) could not create ghost sink pad from $(self.osd.name)")
			if not self.add_pad(src_pad)
				error(@"could not add $(src_pad.name) ghost pad to $(self.name)")
			
			Gst.Debug.BIN_TO_DOT_FILE_WITH_TS(self, Gst.DebugGraphDetails.ALL, @"$(self.name).construct_end")

		// TODO(mdegans) patch nvinfer and submit to Nvidia so this isn't necessary
		/**
		 * Copy reqiured models into user model path if they don't already exist.
		 * This is necessary becuase no matter what, nvinfer will try to write 
		 * to the model path, and will follow symlinks.
		 * 
		 * NOTE(mdegans): actually, it won't load from this path either, so
		 * patching nvinfer may be necessary no matter what (see issue #4)
		 *
		 * @return a dict (libgee's HashMap) of string,string with the model-file, proto-file, and label-file
		 * @throws Error on failure to copy config file or create a path
		 */
		def static ensure_models():dict of string,string raises Error
			dest_dir:string = NValhalla.Setup.model_dir()
			// set up source paths
			var sources = new dict of string,string
			sources["model-file"] = GLib.Path.build_filename(NValhalla.Setup.MODEL_DIR, MODEL_BASENAME)
			sources["proto-file"] = GLib.Path.build_filename(NValhalla.Setup.MODEL_DIR, PROTO_BASENAME)
			sources["labelfile-path"] = GLib.Path.build_filename(NValhalla.Setup.MODEL_DIR, LABEL_BASENAME)
			// set up dest paths
			var dests = new dict of string,string
			dests["model-file"] = GLib.Path.build_filename(dest_dir, MODEL_BASENAME)
			dests["proto-file"] = GLib.Path.build_filename(dest_dir, PROTO_BASENAME)
			dests["labelfile-path"] = GLib.Path.build_filename(dest_dir, LABEL_BASENAME)
			// symlink all sources to destination
			for var key in sources.keys
				if GLib.FileUtils.test(dests[key], GLib.FileTest.EXISTS)
					continue
				NValhalla.Utils.sync_copy_file(sources[key], dests[key], null)
			return dests

		/**
		 * Setup environment and paths
		 *
		 * run ensure_config, run ensure_model_dir, and run ensure_models
		 *
		 * @return a dict (libgee's HashMap) of string,string containing 
		 * parameters for the primary inference engine
		 * @throws Error on failure to copy config file or create a path
		 */
		def static setup():dict of string,string raises Error
			ensure_models()
			config_source:string = GLib.Path.build_filename(NValhalla.Setup.NVINFER_CONFIG_DIR, CONFIG_BASENAME)
			config_dest:string = GLib.Path.build_filename(NValhalla.Setup.config_dir(), CONFIG_BASENAME)
			// load the config source
			if not GLib.FileUtils.test(config_dest, GLib.FileTest.EXISTS)
				NValhalla.Utils.sync_copy_file(config_source, config_dest, null)
			var conf = new dict of string,string
			// this may make more sense when "labelfile-path, model-file, and proto-file"
			conf["config-file-path"] = config_dest
			return conf

		// TODO(mdegans): make this into a library and proper plugin for 
		// gstreamer
		// init is "static construct" in Vala and _class_init() in C, confusingly not at all like not 
		// __init__ in Python (that's "construct")
		// https://stackoverflow.com/questions/34706079/class-construct-for-genie
		// https://gstreamer.freedesktop.org/documentation/plugin-development/basics/boiler.html#element-metadata
		//  init
		//  	// so by trial and error, i figured out how to wrap lines. the ; must absolutely be at the end 
		//  	// or else "syntax error, expected identifier"
		//  	set_static_metadata(
		//  		"nvredact",
		//  		"Filter",
		//  		"Redacts faces and license plates using nvinfer",
		//  		"Michael de Gans <michael.john.degans@gmail.com>"
		//  	);
		//  	sink_template:Gst.StaticPadTemplate = Gst.StaticPadTemplate()
		//  	sink_template.direction = Gst.PadDirection.SINK
		//  	sink_template.name_template = "sink"
		//  	sink_template.presence = Gst.PadPresence.ALWAYS
		//  	sink_template.static_caps = Gst.StaticCaps()
		//  	sink_template.static_caps.string = "video/x-raw(memory:NVMM)"
		//  	//  sink_template.static_caps.caps = ???
		//  	// todo: figure out how to get the actual Gst.Caps
		//  	add_static_pad_template(sink_template)
		//  	src_template:Gst.StaticPadTemplate = Gst.StaticPadTemplate()
		//  	src_template.direction = Gst.PadDirection.SRC
		//  	src_template.name_template = "src"
		//  	src_template.presence = Gst.PadPresence.ALWAYS
		//  	src_template.static_caps = Gst.StaticCaps()
		//  	src_template.static_caps.string = "video/x-raw(memory:NVMM)"
		//  	add_static_pad_template(src_template)
