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

[indent = 0]

//  def static plugin_init(plugin:Gst.Plugin): bool
//  	Gst.Element.register(plugin, "nvredact", Gst.Rank.NONE, typeof(NValhalla.Bins.Redaction))
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

	class Redaction: Gst.Bin

		// TODO(mdegans) make this more flexible so alternative install prefixes work:
		const DEFAULT_PIE_CONFIG:string = "/usr/local/share/nvalhalla/nvinfer_configs/redaction.txt"

		// Redaction elements:
		pie:dynamic Gst.Element  
		// dynamic means no need to obj.get_property("foo")... you can obj.foo instead like python obj.props.foo
		// "dynamic" like half of Genie and Vala, is barely documented, don't ask me where i found out about it
		// i don't even remember and can't find it again on a Google....
		// and this may have been it: https://mail.gnome.org/archives/vala-list/2012-March/msg00009.html
		osdconv:Gst.Element
		//  osdcaps:Gst.Element
		osd:Gst.Element

		// this is like a read only @property in python. a _probe_id is declared automatically
		prop readonly probe_id:ulong
		// these are getters and setters:
		prop num_sources:int
			get
				return self.pie.batch_size
			set
				config_dir:string = ensure_config_dir()
				basename:string = @"redaction_b$(value)_fp32.engine"
				self.pie.model_engine_file = GLib.Path.build_filename(config_dir, basename)
				self.pie.batch_size = value

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

		construct(name:string?, pie_config:string?, num_sources:int?)
			if name != null
				self.name = name

			// create and add the primary inference element
			self.pie = Gst.ElementFactory.make("nvinfer", "pie")
			if self.pie == null or not self.add(self.pie)
				error(@"$(self.name) failed to create or add nvinfer element")
			self.num_sources = num_sources != null ? num_sources : 1
			self.pie.config_file_path = pie_config != null ? pie_config : DEFAULT_PIE_CONFIG

			// create the converter element
			self.osdconv = Gst.ElementFactory.make("nvvideoconvert", "osdconv")
			if self.osdconv == null or not self.add(self.osdconv)
				error(@"$(self.name) failed to create or add nvvideoconvert element")

			// create the osd element
			self.osd = Gst.ElementFactory.make("nvdsosd", "osd")
			if self.osd == null or not self.add(self.osd)
				error(@"$(self.name) failed to create or add nvdsosd element")

			// link all elements
			if not self.pie.link_many(self.osdconv, self.osd)
				error(@"$(self.name) faild to link nvinfer ! nvvideoconvert ! nvdsosd")

			// connect the buffer callback to the sink pad
			osd_sink_pad:Gst.Pad? = self.osd.get_static_pad("sink")
			if osd_sink_pad == null
				error(@"$(self.name) failed to get osd sink pad")
			self._probe_id = osd_sink_pad.add_probe(Gst.PadProbeType.BUFFER, on_buffer_osd_redact)

			// ghost (proxy) inner pads to outer pads, since pads have to be on
			// the same hierarchy in order to be linked (can't an pad inside one bin to
			// an pad outside, or in another bin)
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


	class RtspServerSink: Gst.Bin
		// this Bin is mostly ported from deepstream-test1.py by Nvidia, so...
		//
		// Copyright (c) 2019, NVIDIA CORPORATION. All rights reserved.
		//
		// Permission is hereby granted, free of charge, to any person obtaining a
		// copy of this software and associated documentation files (the "Software"),
		// to deal in the Software without restriction, including without limitation
		// the rights to use, copy, modify, merge, publish, distribute, sublicense,
		// and/or sell copies of the Software, and to permit persons to whom the
		// Software is furnished to do so, subject to the following conditions:
		//
		// The above copyright notice and this permission notice shall be included in
		// all copies or substantial portions of the Software.
		//
		// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
		// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
		// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL
		// THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
		// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
		// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
		// DEALINGS IN THE SOFTWARE.
		const DEFAULT_HOST:string = "127.0.0.1"
		const DEFAULT_PORT:int = 5400
		const DEFAULT_ASYNC:bool = false
		const DEFAULT_SYNC:bool = true

		prop readonly uri:string

		// Bin elements
		converter:Gst.Element
		capsfilter:Gst.Element
		encoder:Gst.Element
		pay:Gst.Element
		queue:Gst.Element
		udpsink:Gst.Element

		//  RTSP server
		server:Gst.RTSPServer.Server
		factory:Gst.RTSPServer.MediaFactory

		// TODO(mdegans), add port parameter
		construct(name:string?)
			if name != null
				self.name = name

			// create and add the converter element
			self.converter = Gst.ElementFactory.make("nvvideoconvert", "converter")
			if self.converter == null or not self.add(self.converter)
				error(@"$(self.name) could not create or add nvvidconv")
			// create and add the capsfilter element
			self.capsfilter = Gst.ElementFactory.make("capsfilter", "capsfilter")
			if self.capsfilter == null or not self.add(self.capsfilter)
				error(@"$(self.name) could not create or add capsfilter")
			self.capsfilter.set_property( \
				"caps", \
				Gst.Caps.from_string("video/x-raw(memory:NVMM), format=I420"))
			//  create and add the encoder element
			self.encoder = Gst.ElementFactory.make("nvv4l2h264enc", "encoder")
			if self.encoder == null or not self.add(self.encoder)
				error(@"$(self.name) could not create or add encoder")
			self.encoder.set_property("bitrate", 4000000)
			// without these properties on tegra, the whole thing doesn't work
			// TODO(mdegans): read the docs on what these do
#if TEGRA
			self.encoder.set_property("preset-level", 1)
			self.encoder.set_property("insert-sps-pps", 1)
			self.encoder.set_property("bufapi-version", 1)
#endif
			// create and add the rtp pay element
			self.pay = Gst.ElementFactory.make("rtph264pay", "pay")
			if self.pay == null or not self.add(self.pay)
				error(@"$(self.name) could not create or add pay element")
			// create and add the queue element
			// TODO: experiment with queue placement
			self.queue = Gst.ElementFactory.make("queue", "queue")
			if self.queue == null or not self.add(self.queue)
				error(@"$(self.name) could not create or add queue element")

			self.udpsink = Gst.ElementFactory.make("udpsink", "udpsink")
			if self.udpsink == null or not self.add(self.udpsink)
				error(@"$(self.name) could not create or add udpsink element")
			self.udpsink.set_property("host", DEFAULT_HOST)
			// TODO: check if port is in use and increment until finding unused
			self.udpsink.set_property("port", DEFAULT_PORT)
			self.udpsink.set_property("async", DEFAULT_ASYNC)
			self.udpsink.set_property("sync", DEFAULT_SYNC)

			//  Element.link_many() exists unlike Python, which is missing it for
			//  unknown reasons that are probbably good ones
			if not self.converter.link_many( \
					self.capsfilter, \
					self.encoder, \
					self.pay, \
					self.queue, \
					self.udpsink)  // trailing comma is not allowed in Genie :(
				error(@"$(self.name) could not link elements together")
			
			// ghost the sink rce pad to the outside of the bin
			inner_pad:Gst.Pad = self.converter.get_static_pad("sink")
			sink_pad:Gst.GhostPad = new Gst.GhostPad.from_template("sink", inner_pad, inner_pad.padtemplate)
			if sink_pad == null
				error(@"$(self.name) could not create ghost sink pad from $(self.converter.name)")
			if not self.add_pad(sink_pad)
				error(@"could not add $(sink_pad.name) ghost pad to $(self.name)")

			//  create the rtsp server
			self.server = new Gst.RTSPServer.Server()
			// this seems to have issues
			self.server.set_service("8554")
			// TODO(mdegans): this is returning -1 ... read docs for why
			//  rtsp_port:int = self.server.get_bound_port()
			// according to docs, this should be called last
			self.server.attach(null)

			// TODO(mdegans): make it easy to configure multicast, TLS
			// TODO(mdegans): modify RTSPServer source so the udp sources and sinks aren't necessary
			//  it would be nice if the factory could accept a pre-existing bin like self in this case
			self.factory = new Gst.RTSPServer.MediaFactory()
			self.factory.set_launch("( udpsrc name=pay0 port=5400 caps=\"application/x-rtp, media=video, clock-rate=90000, encoding-name=(string)H264, payload=96\" )")
			self.factory.set_shared(true)
			mounts:Gst.RTSPServer.MountPoints? = self.server.get_mount_points()
			if mounts == null
				error(@"$(self.name) could not get MountPoints from server.")
			mounts.add_factory("/nvalhalla", self.factory)

			self._uri = @"rtsp://$(GLib.Environment.get_host_name()):8554/nvalhalla"
			// TODO(mdegans): replace print with proper Gst logging
			print(@"$(self.name) serving rtsp on $(self.uri)")
			Gst.Debug.BIN_TO_DOT_FILE_WITH_TS(self, Gst.DebugGraphDetails.ALL, @"$(self.name).construct_end")
