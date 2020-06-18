/* distancing.gs
 *
 * Copyright 2020 Michael de Gans
 *
 * 4019dc5f7144321927bab2a4a3a3860a442bc239885797174c4da291d1479784
 * 5a4a83a5f111f5dbd37187008ad889002bce85c8be381491f8157ba337d9cde7
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

namespace NValhalla.Bins

	// TODO(mdegans): common base class for Distancing and Redactor
	// TODO(mdegans): consider separating distancing and tiling
	/**
	 * A {@link Gst.Bin} that redacts and tiles multiple video streams. it:
	 *
	 * * has static ghost pads and can be linked with {@link Gst.Element.link}.
	 * * expects a nvstreammux before and some kind of sink after.
	 * * It's string approximation would be:
	 * "nvinfer ! nvmultistreamtiler ! nvvideoconvert ! nvdsosd".
	 */
	class Distancing:Gst.Bin
		// TODO(mdegans): hook this up as a signal
		//  (never done that before, but I know it's possible)
		//  delegate ResultsCallback (results: string) : bool

		// constants needed by the distancing
		const CONFIG_SUBDIR:string = "deepstream-5.0"
		const CONFIG_BASENAME:string = "resnet10.txt"
		const MODEL_SUBDIR:string = "Primary_Detector"
		const MODEL_BASENAME:string = "resnet10.caffemodel"
		const PROTO_BASENAME:string = "resnet10.prototxt"
		const LABEL_BASENAME:string = "labels.txt"
		const CALIB_BASENAME:string = "cal_trt.bin"
		const DEFAULT_CLASS_ID:int = 2

		/** primary nvinfer engine */
		pie:dynamic Gst.Element

		/** tracker element to avoid repeated inferences */
		tracker:dynamic Gst.Element

		/** nvmultistreamtiler to tile the multiple streams */
		tiler:dynamic Gst.Element

		/** dsdistance element to add drawing metadata for the osd */
		distance:dynamic Gst.Element

		/** payloadbroker element to broker the metadata */
		broker:dynamic Gst.Element

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
					basename:string = @"resnet10_b$(value)_gpu$(gpu_id)_fp32.engine"
					self.pie.model_engine_file = GLib.Path.build_filename(dest_dir, MODEL_SUBDIR, basename)
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
		 * set/get the class id of a person
		 */
		prop class_id:int
			get
				return self.distance.class_id
			set
				self.distance.class_id = value

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
			self.pie.interval = 1

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

			// create the distancing element
			self.distance = Gst.ElementFactory.make("dsdistance", "distance")
			if self.distance == null or not self.add(self.distance)
				error("could not creat or add dsdistance element")
			self.distance.class_id = DEFAULT_CLASS_ID

			// create the payload broker element
			// TODO(mdegans): test with Nvidia's kafka broker and make sure
			//  the payload is attached as nvidia's elements expect
			self.broker = Gst.ElementFactory.make("payloadbroker", "broker")
			if self.broker == null or not self.add(self.broker)
				error("could not create or add payload broker")
			self.broker.mode = 2
			self.broker.basepath = "/tmp/nvalhallameta"

			// create the converter element
			self.osdconv = Gst.ElementFactory.make("nvvideoconvert", "osdconv")
			if self.osdconv == null or not self.add(self.osdconv)
				error(@"$(self.name) failed to create or add nvvideoconvert element")

			// create the osd element
			self.osd = Gst.ElementFactory.make("nvdsosd", "osd")
			if self.osd == null or not self.add(self.osd)
				error(@"$(self.name) failed to create or add nvdsosd element")

			// link all elements
			if not self.pie.link_many( \
					self.tracker, self.tiler, self.distance, \
					self.broker, self.osdconv, self.osd)
				error(@"$(self.name) failed to link elements")

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
			dest_dir:string = GLib.Path.build_filename(NValhalla.Setup.model_dir(), MODEL_SUBDIR)
			// make the primary detector paths
			NValhalla.Utils.mkdirs(dest_dir)
			// set up source paths
			var sources = new dict of string,string
			sources["model-file"] = GLib.Path.build_filename(NValhalla.Setup.MODEL_DIR, MODEL_SUBDIR, MODEL_BASENAME)
			sources["proto-file"] = GLib.Path.build_filename(NValhalla.Setup.MODEL_DIR, MODEL_SUBDIR, PROTO_BASENAME)
			sources["labelfile-path"] = GLib.Path.build_filename(NValhalla.Setup.MODEL_DIR, MODEL_SUBDIR, LABEL_BASENAME)
			sources["int8-calib-file"] = GLib.Path.build_filename(NValhalla.Setup.MODEL_DIR, MODEL_SUBDIR, CALIB_BASENAME)
			// set up dest paths
			var dests = new dict of string,string
			dests["model-file"] = GLib.Path.build_filename(dest_dir, MODEL_BASENAME)
			dests["proto-file"] = GLib.Path.build_filename(dest_dir, PROTO_BASENAME)
			dests["labelfile-path"] = GLib.Path.build_filename(dest_dir, LABEL_BASENAME)
			dests["int8-calib-file"] = GLib.Path.build_filename(dest_dir, CALIB_BASENAME)
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
			config_source:string = GLib.Path.build_filename(NValhalla.Setup.NVINFER_CONFIG_DIR, CONFIG_SUBDIR, CONFIG_BASENAME)
			config_subdir:string = GLib.Path.build_filename(NValhalla.Setup.config_dir(), CONFIG_SUBDIR)
			config_dest:string = GLib.Path.build_filename(config_subdir, CONFIG_BASENAME)
			// ensure the config subdir exists
			NValhalla.Utils.mkdirs(config_subdir)
			// copy the config source
			if not GLib.FileUtils.test(config_dest, GLib.FileTest.EXISTS)
				NValhalla.Utils.sync_copy_file(config_source, config_dest, null)
			var conf = new dict of string,string
			// this may make more sense when "labelfile-path, model-file, and proto-file"
			conf["config-file-path"] = config_dest
			return conf
