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
		pie:Gst.Element
		osdconv:Gst.Element
		//  osdcaps:Gst.Element
		osd:Gst.Element

		// this is like a read only @property in python. a _probe_id is declared automatically
		prop readonly probe_id:ulong

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

		construct(name:string?, pie_config:string?)
			if name != null
				self.name = name

			// create and add the primary inference element
			self.pie = Gst.ElementFactory.make("nvinfer", "pie")
			if self.pie == null or not self.add(self.pie)
				error(@"$(self.name) failed to create or add nvinfer element")
			self.pie.set_property("config-file-path", pie_config != null ? pie_config : DEFAULT_PIE_CONFIG)

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
