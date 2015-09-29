/*!
 * VIZABI BUBBLECHART
 */

(function () {

  "use strict";

  var Vizabi = this.Vizabi;
  var utils = Vizabi.utils;
  var iconset = Vizabi.iconset;

  //warn client if d3 is not defined
  if (!Vizabi._require('d3')) return;


  //BUBBLE CHART COMPONENT
  Vizabi.Component.extend('gapminder-bubblechart', {

    /**
     * Initializes the component (Bubble Chart).
     * Executed once before any template is rendered.
     * @param {Object} config The options passed to the component
     * @param {Object} context The component's parent
     */
    init: function (config, context) {
      var _this = this;
      this.name = 'bubblechart';
      this.template = 'bubblechart.html';

      //define expected models for this component
      this.model_expects = [{
        name: "time",
        type: "time"
      }, {
        name: "entities",
        type: "entities"
      }, {
        name: "marker",
        type: "model"
      }, {
        name: "language",
        type: "language"
      }];

      //starts as splash if this is the option
      this._splash = config.ui.splash;

      this.model_binds = {
        'change:time': function (evt, original) {
          if(_this._splash !== _this.model.time.splash) {
            if (!_this._readyOnce) return;
            _this._splash = _this.model.time.splash;
            //TODO: adjust X & Y axis here
          }
        },
        "change:time:record": function () {
            //console.log("change time record");
            if(_this.model.time.record) {
                _this._export.open(this.element, this.name);
            }else{
                _this._export.reset();
            }
        },
        "change:time:trails": function (evt) {
          //console.log("EVENT change:time:trails");
          _this._trails.toggle(_this.model.time.trails);
          _this.redrawDataPoints();
        },
        "change:time:lockNonSelected": function (evt) {
          //console.log("EVENT change:time:lockNonSelected");
          _this.redrawDataPoints(500);
        },
        "change:marker": function (evt) {
          // bubble size change is processed separately
          if (!_this._readyOnce) return;
          if (evt.indexOf("change:marker:size") !== -1) return;
          if (evt.indexOf("change:marker:color:palette") > -1) return;
          if (evt.indexOf("min") > -1 || evt.indexOf("max") > -1) {
              _this.updateSize();
              _this.updateMarkerSizeLimits();
              _this._trails.run("findVisible");
              _this.redrawDataPoints();
              _this._trails.run("resize");
              return;
          }
          _this.ready();
          //console.log("EVENT change:marker", evt);
        },
        "change:entities:select": function () {
          if (!_this._readyOnce) return;
          //console.log("EVENT change:entities:select");
          _this.selectDataPoints();
          _this.redrawDataPoints();
          _this._trails.run(["resize", "recolor", "findVisible", "reveal"]);
          _this.updateBubbleOpacity();
          _this._updateDoubtOpacity();
        },
        "change:entities:highlight": function () {
          if (!_this._readyOnce) return;
          //console.log("EVENT change:entities:highlight");
          _this.highlightDataPoints();
        },
        'change:time:value': function () {
          //console.log("EVENT change:time:value");
          _this.updateTime();
          _this._updateDoubtOpacity();

          _this._trails.run("findVisible");
          if (_this.model.time.adaptMinMaxZoom) {
            _this.adaptMinMaxZoom();
          } else {
            _this.redrawDataPoints();
          }
          _this._trails.run("reveal");
          _this.tooltipMobile.classed('vzb-hidden', true);
          _this._bubblesInteract().mouseout();
        },
        'change:time:adaptMinMaxZoom': function () {
          //console.log("EVENT change:time:adaptMinMaxZoom");
          if (_this.model.time.adaptMinMaxZoom) {
            _this.adaptMinMaxZoom();
          } else {
            _this.resetZoomer();
          }
        },
        'change:marker:size': function () {
          //console.log("EVENT change:marker:size:max");
          _this.updateMarkerSizeLimits();
          _this._trails.run("findVisible");
          _this.redrawDataPointsOnlySize();
          _this._trails.run("resize");
        },
        'change:marker:color:palette': function () {
          //console.log("EVENT change:marker:color:palette");
          _this.redrawDataPointsOnlyColors();
          _this._trails.run("recolor");
        },
        'change:entities:opacitySelectDim': function () {
          _this.updateBubbleOpacity();
        },
        'change:entities:opacityRegular': function () {
          _this.updateBubbleOpacity();
        }
      };

      this._super(config, context);

      this.xScale = null;
      this.yScale = null;
      this.sScale = null;
      this.cScale = null;

      this.xAxis = d3.svg.axisSmart();
      this.yAxis = d3.svg.axisSmart();


      this.cached = {};
      this.xyMaxMinMean = {};
      this.currentZoomFrameXY = null;
      this.draggingNow = null;

      // default UI settings
      this.ui = utils.extend({
        whenHovering: {},
        labels: {}
      }, this.ui["vzb-tool-" + this.name]);

      this.ui.whenHovering = utils.extend({
        showProjectionLineX: true,
        showProjectionLineY: true,
        higlightValueX: true,
        higlightValueY: true
      }, this.ui.whenHovering);

      this.ui.labels = utils.extend({
        autoResolveCollisions: false,
        dragging: true
      }, this.ui.labels);


      var Trail = Vizabi.Helper.get("gapminder-bublechart-trails");
      this._trails = new Trail(this);

      var Exporter = Vizabi.Helper.get("gapminder-svgexport");
      this._export = new Exporter(this);
      this._export
            .prefix("vzb-bc-")
            .deleteClasses(["vzb-bc-bubbles-crop", "vzb-hidden", "vzb-bc-year", "vzb-bc-zoomRect", "vzb-bc-projection-x", "vzb-bc-projection-y", "vzb-bc-axis-c-title"]);



      //            this.collisionResolver = d3.svg.collisionResolver()
      //                .value("labelY2")
      //                .fixed("labelFixed")
      //                .selector("text")
      //                .scale(this.yScale)
      //                .handleResult(this._repositionLabels);


      this.dragger = d3.behavior.drag()
        .on("dragstart", function (d, i) {
        	d3.event.sourceEvent.stopPropagation();
        	var KEY = _this.KEY;
        	_this.druging = d[KEY];
        })
        .on("drag", function (d, i) {
          var KEY = _this.KEY;
          if (!_this.ui.labels.dragging) return;
          var cache = _this.cached[d[KEY]];
          cache.labelFixed = true;


          cache.labelX_ += d3.event.dx / _this.width;
          cache.labelY_ += d3.event.dy / _this.height;

          var resolvedX = _this.xScale(cache.labelX0) + cache.labelX_ * _this.width;
          var resolvedY = _this.yScale(cache.labelY0) + cache.labelY_ * _this.height;

          var resolvedX0 = _this.xScale(cache.labelX0);
          var resolvedY0 = _this.yScale(cache.labelY0);

          var lineGroup = _this.entityLines.filter(function (f) {
            return f[KEY] == d[KEY];
          });

          _this._repositionLabels(d, i, this, resolvedX, resolvedY, resolvedX0, resolvedY0, 0, lineGroup);
        })
        .on("dragend", function (d, i) {
        	var KEY = _this.KEY;
        _this.druging = null;
          _this.model.entities.setLabelOffset(d, [
            _this.cached[d[KEY]].labelX_,
            _this.cached[d[KEY]].labelY_
          ]);
        });


      this.dragRectangle = d3.behavior.drag()
        .on("dragstart", function (d, i) {
          if (!(d3.event.sourceEvent.ctrlKey || d3.event.sourceEvent.metaKey)) return;

          this.ctrlKeyLock = true;
          this.origin = {
            x: d3.mouse(this)[0] - _this.activeProfile.margin.left,
            y: d3.mouse(this)[1] - _this.activeProfile.margin.top
          };
          _this.zoomRect.classed("vzb-invisible", false);
        })
        .on("drag", function (d, i) {
          if (!this.ctrlKeyLock) return;
          var origin = this.origin;
          var mouse = {
            x: d3.event.x - _this.activeProfile.margin.left,
            y: d3.event.y - _this.activeProfile.margin.top
          };

          _this.zoomRect
            .attr("x", Math.min(mouse.x, origin.x))
            .attr("y", Math.min(mouse.y, origin.y))
            .attr("width", Math.abs(mouse.x - origin.x))
            .attr("height", Math.abs(mouse.y - origin.y));
        })

        .on("dragend", function (e) {
          if (!this.ctrlKeyLock) return;
          this.ctrlKeyLock = false;

          _this.zoomRect
            .attr("width", 0)
            .attr("height", 0)
            .classed("vzb-invisible", true);

          this.target = {
            x: d3.mouse(this)[0] - _this.activeProfile.margin.left,
            y: d3.mouse(this)[1] - _this.activeProfile.margin.top
          };

          _this._zoomOnRectangle(d3.select(this), this.origin.x, this.origin.y, this.target.x, this.target.y, true, 500);
        });

      this.zoomer = d3.behavior.zoom()
        .scaleExtent([1, 100])
        .on("zoom", function () {
          if (d3.event.sourceEvent != null && (d3.event.sourceEvent.ctrlKey || d3.event.sourceEvent.metaKey)) return;


          //send the event to the page if fully zoomed our or page not scrolled into view
          if(d3.event.sourceEvent != null && _this.scrollableAncestor){

              if(d3.event.scale == 1) _this.scrollableAncestor.scrollTop += d3.event.sourceEvent.deltaY;

              if(utils.getViewportPosition(_this.element.node()).y < 0 && d3.event.scale > 1){
                  _this.scrollableAncestor.scrollTop += d3.event.sourceEvent.deltaY;
                  return;
              }
          }

          _this.model._data.entities.clearHighlighted();
          _this._setTooltip();

          var zoom = d3.event.scale;
          var pan = d3.event.translate;
          var ratioY = _this.zoomer.ratioY;
          var ratioX = _this.zoomer.ratioX;


          // console.log(d3.event.scale, _this.zoomer.ratioY, _this.zoomer.ratioX)

          _this.draggingNow = true;

          //value protections and fallbacks
          if (isNaN(zoom) || zoom == null) zoom = _this.zoomer.scale();
          if (isNaN(zoom) || zoom == null) zoom = 1;

          //TODO: this is a patch to fix #221. A proper code review of zoom and zoomOnRectangle logic is needed
          if (zoom==1) {_this.zoomer.ratioX = 1; ratioX = 1; _this.zoomer.ratioY = 1; ratioY = 1}

          if (isNaN(pan[0]) || isNaN(pan[1]) || pan[0] == null || pan[1] == null) pan = _this.zoomer.translate();
          if (isNaN(pan[0]) || isNaN(pan[1]) || pan[0] == null || pan[1] == null) pan = [0, 0];


          // limit the zooming, so that it never goes below 1 for any of the axes
          if (zoom * ratioY < 1) {
            ratioY = 1 / zoom;
            _this.zoomer.ratioY = ratioY
          }
          if (zoom * ratioX < 1) {
            ratioX = 1 / zoom;
            _this.zoomer.ratioX = ratioX
          }

          //limit the panning, so that we are never outside the possible range
          if (pan[0] > 0) pan[0] = 0;
          if (pan[1] > 0) pan[1] = 0;
          if (pan[0] < (1 - zoom * ratioX) * _this.width) pan[0] = (1 - zoom * ratioX) * _this.width;
          if (pan[1] < (1 - zoom * ratioY) * _this.height) pan[1] = (1 - zoom * ratioY) * _this.height;
          _this.zoomer.translate(pan);

          var xRange = [0 * zoom * ratioX + pan[0], _this.width * zoom * ratioX + pan[0]];
          var yRange = [_this.height * zoom * ratioY + pan[1], 0 * zoom * ratioY + pan[1]];

          if (_this.model.marker.axis_x.scaleType === 'ordinal')
            _this.xScale.rangeBands(xRange);
          else
            _this.xScale.range(xRange);

          if (_this.model.marker.axis_y.scaleType === 'ordinal')
            _this.yScale.rangeBands(yRange);
          else
            _this.yScale.range(yRange);

          // Keep the min and max size (pixels) constant, when zooming.
          //                    _this.sScale.range([utils.radiusToArea(_this.minRadius) * zoom * zoom * ratioY * ratioX,
          //                                        utils.radiusToArea(_this.maxRadius) * zoom * zoom * ratioY * ratioX ]);

          var optionsY = _this.yAxis.labelerOptions();
          var optionsX = _this.xAxis.labelerOptions();
          optionsY.limitMaxTickNumber = zoom * ratioY < 2 ? 7 : 14;
          optionsY.transitionDuration = _this.zoomer.duration;
          optionsX.transitionDuration = _this.zoomer.duration;

          _this.xAxisEl.call(_this.xAxis.labelerOptions(optionsX));
          _this.yAxisEl.call(_this.yAxis.labelerOptions(optionsY));
          _this.redrawDataPoints(_this.zoomer.duration);
          _this._trails.run("resize", null, _this.zoomer.duration);

          _this.zoomer.duration = 0;

        })
        .on('zoomend', function () {
          _this.draggingNow = false;
        });

      this.zoomer.ratioX = 1;
      this.zoomer.ratioY = 1;

      this.fontSettings = {
        minSize: 8,
        step: 2
      };
    },


    /**
     * Executes right after the template is in place, but the model is not yet ready
     */
    readyOnce: function () {
      var _this = this;

      this.scrollableAncestor = utils.findScrollableAncestor(this.element);
      this.element = d3.select(this.element);

      // reference elements
      this.graph = this.element.select('.vzb-bc-graph');
      this.yAxisElContainer = this.graph.select('.vzb-bc-axis-y');
      this.yAxisEl = this.yAxisElContainer.select('g');

      this.xAxisElContainer = this.graph.select('.vzb-bc-axis-x');
      this.xAxisEl = this.xAxisElContainer.select('g');

      this.yTitleEl = this.graph.select('.vzb-bc-axis-y-title');
      this.xTitleEl = this.graph.select('.vzb-bc-axis-x-title');
      this.sTitleEl = this.graph.select('.vzb-bc-axis-s-title');
      this.cTitleEl = this.graph.select('.vzb-bc-axis-c-title');
      this.yearEl = this.graph.select('.vzb-bc-year');

      this.yInfoEl = this.graph.select('.vzb-bc-axis-y-info');
      this.xInfoEl = this.graph.select('.vzb-bc-axis-x-info');
      this.dataWarningEl = this.graph.select('.vzb-data-warning');

      this.fontSettings.maxTitleFontSize = parseInt(this.sTitleEl.style('font-size'), 10);

      this.projectionX = this.graph.select(".vzb-bc-projection-x");
      this.projectionY = this.graph.select(".vzb-bc-projection-y");

      this.trailsContainer = this.graph.select('.vzb-bc-trails');
      this.bubbleContainerCrop = this.graph.select('.vzb-bc-bubbles-crop');
      this.bubbleContainer = this.graph.select('.vzb-bc-bubbles');
      this.labelsContainer = this.graph.select('.vzb-bc-labels');
      this.linesContainer = this.graph.select('.vzb-bc-lines');
      this.zoomRect = this.element.select('.vzb-bc-zoomRect');

      this.entityBubbles = null;
      this.entityLabels = null;
      this.tooltip = this.element.select('.vzb-bc-tooltip');
      this.tooltipMobile = this.element.select('.vzb-tooltip-mobile');
      this.entityLines = null;
      //component events
      this.on("resize", function () {
        //console.log("EVENT: resize");
        _this.updateSize();
        _this.updateMarkerSizeLimits();
        _this._trails.run("findVisible");
        _this.resetZoomer(); // includes redraw data points and trail resize
      });

      //keyboard listeners
      d3.select("body")
        .on("keydown", function () {
          if (d3.event.metaKey || d3.event.ctrlKey) _this.element.select("svg").classed("vzb-zoomin", true);
        })
        .on("keyup", function () {
          if (!d3.event.metaKey && !d3.event.ctrlKey) _this.element.select("svg").classed("vzb-zoomin", false);
        });

      this.element
        //.call(this.zoomer)
        //.call(this.dragRectangle)
        .on("mouseup", function(){
          _this.draggingNow = false;
        })
        .onTap(function () {
          return;
          _this._bubblesInteract().mouseout();
          _this.tooltipMobile.classed('vzb-hidden', true);
        });

      this.KEY = this.model.entities.getDimension();
      this.TIMEDIM = this.model.time.getDimension();

      this._calculateAllValues();
      this._valuesCalculated = true; //hack to avoid recalculation

      this.updateUIStrings();

      this.wScale = d3.scale.linear()
        .domain(this.parent.datawarning_content.doubtDomain)
        .range(this.parent.datawarning_content.doubtRange);

      this.updateIndicators();
      this.updateEntities();
      this.updateTime();
      this.updateSize();
      this.updateMarkerSizeLimits();
      this.selectDataPoints();
      this.updateBubbleOpacity();
      this._updateDoubtOpacity();
      this._trails.create();
      this.resetZoomer(); // includes redraw data points and trail resize
      this._trails.run(["recolor", "findVisible", "reveal"]);
      if (this.model.time.adaptMinMaxZoom) this.adaptMinMaxZoom();
    },

    ready: function() {

      if(!this._valuesCalculated) this._calculateAllValues();
      else this._valuesCalculated = false;

      this.updateUIStrings();

      this.updateEntities();
      this.redrawDataPoints();
      this.updateBubbleOpacity();
      this.updateIndicators();
      this.updateSize();
      this.updateMarkerSizeLimits();
      this._trails.create();
      this._trails.run("findVisible");
      this.resetZoomer();
      this._trails.run(["recolor", "reveal"]);

    },

    /*
     * UPDATE INDICATORS
     */
    updateIndicators: function () {
      var _this = this;

      //scales
      this.yScale = this.model.marker.axis_y.getScale();
      this.xScale = this.model.marker.axis_x.getScale();
      this.sScale = this.model.marker.size.getScale();
      this.cScale = this.model.marker.color.getScale();

      //            this.collisionResolver.scale(this.yScale);


      this.yAxis.tickFormat(_this.model.marker.axis_y.tickFormatter);
      this.xAxis.tickFormat(_this.model.marker.axis_x.tickFormatter);

      this.xyMaxMinMean = {
        x: this.model.marker.axis_x.getMaxMinMean({timeFormatter: this.timeFormatter, skipZeros: true}),
        y: this.model.marker.axis_y.getMaxMinMean({timeFormatter: this.timeFormatter, skipZeros: true}),
        s: this.model.marker.size.getMaxMinMean({timeFormatter: this.timeFormatter, skipZeros: true})
      };
    },


    updateUIStrings: function () {
      var _this = this;

      this.translator = this.model.language.getTFunction();
      this.timeFormatter = d3.time.format(_this.model.time.formatOutput);
      var indicatorsDB = Vizabi._globals.metadata.indicatorsDB;

      this.strings = {
          title:{
              Y: this.translator("indicator/" + this.model.marker.axis_y.which),
              X: this.translator("indicator/" + this.model.marker.axis_x.which),
              S: this.translator("indicator/" + this.model.marker.size.which),
              C: this.translator("indicator/" + this.model.marker.color.which)
          },
          unit:{
              Y: this.translator("unit/" + indicatorsDB[this.model.marker.axis_y.which].unit)||"",
              X: this.translator("unit/" + indicatorsDB[this.model.marker.axis_x.which].unit)||"",
              S: this.translator("unit/" + indicatorsDB[this.model.marker.size.which].unit)||"",
              C: this.translator("unit/" + indicatorsDB[this.model.marker.color.which].unit)||""
          }
      }
      if (!!this.strings.unit.Y) this.strings.unit.Y = ", " + this.strings.unit.Y;
      if (!!this.strings.unit.X) this.strings.unit.X = ", " + this.strings.unit.X;
      if (!!this.strings.unit.S) this.strings.unit.S = ", " + this.strings.unit.S;
      if (!!this.strings.unit.C) this.strings.unit.C = ", " + this.strings.unit.C;

      var yTitle = this.yTitleEl.selectAll("text").data([0]);
      yTitle.enter().append("text");
      yTitle
        .attr("y", "-6px")
        .on("click", function(){
            _this.parent
                .findChildByName("gapminder-treemenu")
                .markerID("axis_y")
                .alignX("left")
                .alignY("top")
                .updateView()
                .toggle();
        });

      var xTitle = this.xTitleEl.selectAll("text").data([0]);
      xTitle.enter().append("text");
      xTitle
        .attr("y", "-0.32em")
        .on("click", function(){
            _this.parent
                .findChildByName("gapminder-treemenu")
                .markerID("axis_x")
                .alignX("left") 
                .alignY("bottom")
                .updateView()
                .toggle();
        });

      var sTitle = this.sTitleEl.selectAll("text").data([0]);
      sTitle.enter().append("text");
      sTitle
        .attr("text-anchor", "end");

      this.dataWarningEl.html(iconset['warn']).select("svg").attr("width", "0px").attr("height", "0px");
      this.dataWarningEl.append("text")
          .attr("text-anchor", "end")
           .attr("y", "-0.32em")
          .text(this.translator("hints/dataWarning"));

      //TODO: move away from UI strings, maybe to ready or ready once
      this.yInfoEl.on("click", function(){
        window.open(indicatorsDB[_this.model.marker.axis_y.which].sourceLink, '_blank').focus();
      })
      this.xInfoEl.on("click", function(){
        window.open(indicatorsDB[_this.model.marker.axis_x.which].sourceLink, '_blank').focus();
      })
      this.dataWarningEl
          .on("click", function(){
                _this.parent.findChildByName("gapminder-datawarning").toggle();
            })
          .on("mouseover", function(){
                _this._updateDoubtOpacity(1);
            })
          .on("mouseout", function(){
                _this._updateDoubtOpacity();
            })
    },

    _updateDoubtOpacity: function(opacity){
        if(opacity==null) opacity = this.wScale(+this.timeFormatter(this.time));
        if(this.someSelected) opacity = 1;
        this.dataWarningEl.style("opacity", opacity);
    },

    /*
     * UPDATE ENTITIES:
     * Ideally should only update when show parameters change or data changes
     */
    updateEntities: function () {
      var _this = this;
      var KEY = this.KEY;
      var TIMEDIM = this.TIMEDIM;

      var getKeys = function (prefix) {
          prefix = prefix || "";
          return this.model.marker.getKeys()
            .map(function (d) {
                var pointer = {};
                pointer[KEY] = d[KEY];
                pointer[TIMEDIM] = endTime;
                pointer.sortValue = values.size[d[KEY]];
                pointer[KEY] = prefix + d[KEY];
                return pointer;
            })
            .sort(function (a, b) { return b.sortValue - a.sortValue; })
      };

      // get array of GEOs, sorted by the size hook
      // that makes larger bubbles go behind the smaller ones
      var endTime = this.model.time.end;
      var values = this._getValuesInterpolated(endTime);
      this.model.entities.setVisible(getKeys.call(this));

      this.entityBubbles = this.bubbleContainer.selectAll('.vzb-bc-entity')
        .data(this.model.entities.getVisible(), function (d) {
          return d[KEY]
        });

      //exit selection
      this.entityBubbles.exit().remove();

      //enter selection -- init circles
      this.entityBubbles.enter().append("circle")
        .attr("class", function (d) {
            return "vzb-bc-entity " + d[KEY];
        })
        .on("mouseover", function (d, i) {
          if (utils.isTouchDevice()) return;

          _this._bubblesInteract().mouseover(d, i);
        })
        .on("mouseout", function (d, i) {
          if (utils.isTouchDevice()) return;

          _this._bubblesInteract().mouseout(d, i);
        })
        .on("click", function (d, i) {
          if (utils.isTouchDevice()) return;

          _this._bubblesInteract().click(d, i);
        })
        .onTap(function (d, i) {
          //TODO return interaction on touch device
          return;
          var evt = d3.event;
          _this.tooltipMobile.classed('vzb-hidden', false)
            .attr('style', 'left:' + (evt.changedTouches[0].clientX + 15) + 'px;top:' + (evt.changedTouches[0].clientY - 25) + 'px')
            .html('Hold bubble to select it');
          d3.event.stopPropagation();
          _this._bubblesInteract().mouseout();
          _this._bubblesInteract().mouseover(d, i);
        })
        .onLongTap(function (d, i) {
          //TODO return interaction on touch device
          return;
          _this.tooltipMobile.classed('vzb-hidden', true);
          d3.event.stopPropagation();
          _this._bubblesInteract().mouseout();
          _this._bubblesInteract().click(d, i);
        });


      //TODO: no need to create trail group for all entities
      //TODO: instead of :append an :insert should be used to keep order, thus only few trail groups can be inserted
      this.entityTrails = this.bubbleContainer.selectAll(".vzb-bc-entity")
        .data(getKeys.call(this, "trail-"), function (d) {
                return d[KEY];
            }
        );

        this.entityTrails.enter().insert("g", function (d) {
            return document.querySelector(".vzb-bc-bubbles ." + d[KEY].replace("trail-", ""));
        }).attr("class", function (d) {
          return "vzb-bc-entity" + " " + d[KEY]
        });

    },

    _bubblesInteract: function () {
      var _this = this;
      var KEY = this.KEY;
      var TIMEDIM = this.TIMEDIM;

      return {
        mouseover: function (d, i) {
          _this.model.entities.highlightEntity(d);

          var text = "";
          if (_this.model.entities.isSelected(d) && _this.model.time.trails) {
            text = _this.timeFormatter(_this.time);
            _this.entityLabels
              .filter(function (f) {return f[KEY] == d[KEY]})
              .classed("vzb-highlighted", true);
          } else {
            text = _this.model.marker.label.getValue(d);
          }

          var pointer = {};
          pointer[KEY] = d[KEY];
          pointer[TIMEDIM] = _this.time;
          var x = _this.xScale(_this.model.marker.axis_x.getValue(pointer));
          var y = _this.yScale(_this.model.marker.axis_y.getValue(pointer));
          var s = utils.areaToRadius(_this.sScale(_this.model.marker.size.getValue(pointer)));
          _this._setTooltip(text, x, y, s);
        },

        mouseout: function (d, i) {
          _this.model.entities.clearHighlighted();
          _this._setTooltip();
          _this.entityLabels.classed("vzb-highlighted", false);
        },

        click: function (d, i) {
          if(_this.draggingNow) return;
          _this._setTooltip();
          _this.model.entities.selectEntity(d, TIMEDIM, _this.timeFormatter);
        }
      }
    },

    adaptMinMaxZoom: function () {
      var _this = this;
      var mmmX = _this.xyMaxMinMean.x[_this.timeFormatter(_this.time)];
      var mmmY = _this.xyMaxMinMean.y[_this.timeFormatter(_this.time)];
      var radiusMax = utils.areaToRadius(_this.sScale(_this.xyMaxMinMean.s[_this.timeFormatter(_this.time)].max));
      var frame = _this.currentZoomFrameXY;

      var suggestedFrame = {
        x1: _this.xScale(mmmX.min) - radiusMax,
        y1: _this.yScale(mmmY.min) + radiusMax,
        x2: _this.xScale(mmmX.max) + radiusMax,
        y2: _this.yScale(mmmY.max) - radiusMax
      };

      var TOLERANCE = 0.0;

      if (!frame || suggestedFrame.x1 < frame.x1 * (1 - TOLERANCE) || suggestedFrame.x2 > frame.x2 * (1 + TOLERANCE) || suggestedFrame.y2 < frame.y2 * (1 - TOLERANCE) || suggestedFrame.y1 > frame.y1 * (1 + TOLERANCE)) {
        _this.currentZoomFrameXY = utils.clone(suggestedFrame);
        var frame = _this.currentZoomFrameXY;
        _this._zoomOnRectangle(_this.element, frame.x1, frame.y1, frame.x2, frame.y2, false, _this.duration);
        //console.log("rezoom")
      } else {
        _this.redrawDataPoints(_this.duration);
        //console.log("no rezoom")
      }
    },

    _zoomOnRectangle: function (element, x1, y1, x2, y2, compensateDragging, duration) {
      var _this = this;
      var zoomer = _this.zoomer;

      if (Math.abs(x1 - x2) < 10 || Math.abs(y1 - y2) < 10) return;

      if (Math.abs(x1 - x2) > Math.abs(y1 - y2)) {
        var zoom = _this.height / Math.abs(y1 - y2) * zoomer.scale();
        var ratioX = _this.width / Math.abs(x1 - x2) * zoomer.scale() / zoom * zoomer.ratioX;
        var ratioY = zoomer.ratioY;
      } else {
        var zoom = _this.width / Math.abs(x1 - x2) * zoomer.scale();
        var ratioY = _this.height / Math.abs(y1 - y2) * zoomer.scale() / zoom * zoomer.ratioY;
        var ratioX = zoomer.ratioX;
      }

      if (compensateDragging) {
        zoomer.translate([
          zoomer.translate()[0] + x1 - x2,
          zoomer.translate()[1] + y1 - y2
        ])
      }

      var pan = [
        (zoomer.translate()[0] - Math.min(x1, x2)) / zoomer.scale() / zoomer.ratioX * zoom * ratioX, (zoomer.translate()[1] - Math.min(y1, y2)) / zoomer.scale() / zoomer.ratioY * zoom * ratioY
      ];

      zoomer.scale(zoom);
      zoomer.ratioY = ratioY;
      zoomer.ratioX = ratioX;
      zoomer.translate(pan);
      zoomer.duration = duration ? duration : 0;

      zoomer.event(element);
    },

    resetZoomer: function (element) {
      this.zoomer.scale(1);
      this.zoomer.ratioY = 1;
      this.zoomer.ratioX = 1;
      this.zoomer.translate([0, 0]);
      this.zoomer.duration = 0;
      this.zoomer.event(element || this.element);
    },

    /*
     * UPDATE TIME:
     * Ideally should only update when time or data changes
     */
    updateTime: function () {
      var _this = this;

      this.time_1 = this.time == null ? this.model.time.value : this.time;
      this.time = this.model.time.value;
      this.duration = this.model.time.playing && (this.time - this.time_1 > 0) ? this.model.time.speed : 0;

      this.yearEl.text(this.timeFormatter(this.time));
    },

    /*
     * RESIZE:
     * Executed whenever the container is resized
     */
    updateSize: function () {

      var _this = this;

      this.profiles = {
        "small": {
          margin: {
            top: 30,
            right: 10,
            left: 40,
            bottom: 45
          },
          padding: 2,
          minRadius: 0.5,
          maxRadius: 40
        },
        "medium": {
          margin: {
            top: 40,
            right: 15,
            left: 60,
            bottom: 55
          },
          padding: 2,
          minRadius: 1,
          maxRadius: 55
        },
        "large": {
          margin: {
            top: 50,
            right: 20,
            left: 60,
            bottom: 60
          },
          padding: 2,
          minRadius: 1,
          maxRadius: 70
        }
      };

      this.activeProfile = this.profiles[this.getLayoutProfile()];
      var margin = this.activeProfile.margin;


      //stage
      this.height = parseInt(this.element.style("height"), 10) - margin.top - margin.bottom;
      this.width = parseInt(this.element.style("width"), 10) - margin.left - margin.right;

      //            this.collisionResolver.height(this.height);

      //graph group is shifted according to margins (while svg element is at 100 by 100%)
      this.graph
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");


      this.yearEl
        .attr("x", this.width / 2)
        .attr("y", this.height / 3 * 2)
        .style("font-size", Math.max(this.height / 4, this.width / 4) + "px");

      //update scales to the new range
      if (this.model.marker.axis_y.scaleType !== "ordinal") {
        this.yScale.range([this.height, 0]);
      } else {
        this.yScale.rangePoints([this.height, 0], _this.activeProfile.padding).range();
      }
      if (this.model.marker.axis_x.scaleType !== "ordinal") {
        this.xScale.range([0, this.width]);
      } else {
        this.xScale.rangePoints([0, this.width], _this.activeProfile.padding).range();
      }

      //apply scales to axes and redraw
      this.yAxis.scale(this.yScale)
        .orient("left")
        .tickSize(6, 0)
        .tickSizeMinor(3, 0)
        .labelerOptions({
          scaleType: this.model.marker.axis_y.scaleType,
          toolMargin: {top: 0, right: margin.right, left: margin.left, bottom: 0},
          limitMaxTickNumber: 6
        });

      this.xAxis.scale(this.xScale)
        .orient("bottom")
        .tickSize(6, 0)
        .tickSizeMinor(3, 0)
        .labelerOptions({
          scaleType: this.model.marker.axis_x.scaleType,
          toolMargin: {top: margin.top, right: 5, left: 5, bottom: margin.bottom}
        });


      this.bubbleContainerCrop
        .attr("width", this.width)
        .attr("height", this.height);

      this.xAxisElContainer
        .attr("width", this.width)
        .attr("height", this.activeProfile.margin.bottom)
        .attr("y", this.height);
      this.xAxisEl
        .attr("transform", "translate(0," + 1 + ")");

      this.yAxisElContainer
        .attr("width", this.activeProfile.margin.left)
        .attr("height", this.height)
        .attr("x", -this.activeProfile.margin.left);
      this.yAxisEl
        .attr("transform", "translate(" + (this.activeProfile.margin.left - 1) + "," + 0 + ")");

      this.yAxisEl.call(this.yAxis);
      this.xAxisEl.call(this.xAxis);

      this.projectionX.attr("y1", _this.yScale.range()[0]);
      this.projectionY.attr("x2", _this.xScale.range()[0]);


      var yTitleText = this.yTitleEl.select("text").text(this.strings.title.Y + this.strings.unit.Y);
      if(yTitleText.node().getBBox().width > this.width) yTitleText.text(this.strings.title.Y);

      var xTitleText = this.xTitleEl.select("text").text(this.strings.title.X + this.strings.unit.X);
      if(xTitleText.node().getBBox().width > this.width) xTitleText.text(this.strings.title.X);

      var sTitleText = this.sTitleEl.select("text")
        .text(this.translator("buttons/size") + ": " + this.strings.title.S + ", " +
        this.translator("buttons/colors") + ": " + this.strings.title.C);

      var probe = this.sTitleEl.append("text").text(sTitleText.text());
      var font = parseInt(probe.style("font-size"))
                 * (this.height - 20) / probe.node().getBBox().width;

      if(probe.node().getBBox().width > this.height - 20) {
        sTitleText.style("font-size", font);
      }else{
        sTitleText.style("font-size", null);
      }
      probe.remove();

      var yaxisWidth = this.yAxisElContainer.select("g").node().getBBox().width;
      this.yTitleEl
          .attr("transform", "translate(" + (-yaxisWidth) + ",0)");

      this.xTitleEl
          .attr("transform", "translate(" + (0) + "," + (this.height + margin.bottom) + ")");

      this.sTitleEl
          .attr("transform", "translate(" + this.width + ","+ 20 +") rotate(-90)");

      this.dataWarningEl
          .attr("transform", "translate(" + (this.width) + "," + (this.height + margin.bottom) + ")");

        this.dataWarningEl.select("text").text(
            this.translator("hints/dataWarning" + (this.getLayoutProfile()==='small'?"-little":""))
        )

      var warnBB = this.dataWarningEl.select("text").node().getBBox();
      this.dataWarningEl.select("svg")
          .attr("width",warnBB.height)
          .attr("height",warnBB.height)
          .attr("x", -warnBB.width - warnBB.height * 1.2)
          .attr("y", -warnBB.height * 1.2)

        if(this.yInfoEl.select('text').node()){
            var titleH = this.yInfoEl.select('text').node().getBBox().height || 0;
            var titleW = this.yTitleEl.select('text').node().getBBox().width || 0;
            this.yInfoEl.attr('transform', 'translate('+ (titleW - yaxisWidth + titleH * 1.0) +',' + (-titleH*0.7) + ')');
            this.yInfoEl.select("text").attr("dy", "0.1em")
            this.yInfoEl.select("circle").attr("r", titleH/2);
        }
        if(this.xInfoEl.select('text').node()){
            var titleH = this.xInfoEl.select('text').node().getBBox().height || 0;
            var titleW = this.xTitleEl.select('text').node().getBBox().width || 0;
            this.xInfoEl.attr('transform', 'translate('+ (titleW + titleH * 1.0) +',' + (this.height + margin.bottom -titleH*0.7) + ')');
            this.xInfoEl.select("text").attr("dy", "0.1em")
            this.xInfoEl.select("circle").attr("r", titleH/2);
        }

    },

    updateMarkerSizeLimits: function () {
      var _this = this;
      var minRadius = this.activeProfile.minRadius;
      var maxRadius = this.activeProfile.maxRadius;

      this.minRadius = Math.max(maxRadius * this.model.marker.size.min, minRadius);
      this.maxRadius = Math.max(maxRadius * this.model.marker.size.max, minRadius);

      if (this.model.marker.size.scaleType !== "ordinal") {
        this.sScale.range([utils.radiusToArea(_this.minRadius), utils.radiusToArea(_this.maxRadius)]);
      } else {
        this.sScale.rangePoints([utils.radiusToArea(_this.minRadius), utils.radiusToArea(_this.maxRadius)], 0).range();
      }

    },

    redrawDataPointsOnlyColors: function () {
      var _this = this;
      var KEY = this.KEY;
      var TIMEDIM = this.TIMEDIM;

      this.entityBubbles.style("fill", function (d) {
        var pointer = {};
        pointer[KEY] = d[KEY];
        pointer[TIMEDIM] = _this.time;

        var valueC = _this.model.marker.color.getValue(pointer);
        return _this.cScale(valueC);
      });
    },

    redrawDataPointsOnlySize: function () {
      var _this = this;

      // if (this.someSelected) {
      //   _this.entityBubbles.each(function (d, index) {
      //     _this._updateBubble(d, index, d3.select(this), 0);
      //   });
      // } else {
      //   this.entityBubbles.each(function (d, index) {
      //     var valueS = _this.model.marker.size.getValue(d);
      //     if (valueS == null) return;

      //     d3.select(this).attr("r", utils.areaToRadius(_this.sScale(valueS)));
      //   });
      // }
      var values;
      var KEY = this.KEY;
      if (this.model.time.lockNonSelected && this.someSelected) {
        var tLocked = this.timeFormatter.parse("" + this.model.time.lockNonSelected);
        values = this._getValuesInterpolated(tLocked);
      } else {
        values = this._getValuesInterpolated(this.time);
      }

      this.entityBubbles.each(function (d, index) {

        var valueS = values.size[d[KEY]];
        if (valueS == null) return;

        d3.select(this).attr("r", utils.areaToRadius(_this.sScale(valueS)));
      });
    },

    /*
     * REDRAW DATA POINTS:
     * Here plotting happens
     * debouncing to improve performance: events might trigger it more than 1x
     */
    redrawDataPoints: function (duration) {
      var _this = this;

      if (duration == null) duration = _this.duration;

      var TIMEDIM = this.TIMEDIM;
      var KEY = this.KEY;
      var values, valuesLocked;

      //get values for locked and not locked
      if (this.model.time.lockNonSelected && this.someSelected) {
        var tLocked = this.timeFormatter.parse("" + this.model.time.lockNonSelected);
        valuesLocked = this._getValuesInterpolated(tLocked);
      }

      values = this._getValuesInterpolated(this.time);

      this.entityBubbles.each(function (d, index) {
        var view = d3.select(this);
        _this._updateBubble(d, values, valuesLocked, index, view, duration);

      }); // each bubble

      // Call flush() after any zero-duration transitions to synchronously flush the timer queue
      // and thus make transition instantaneous. See https://github.com/mbostock/d3/issues/1951
      if (_this.duration == 0) d3.timer.flush();

      if (_this.ui.labels.autoResolveCollisions) {
        // cancel previously queued simulation if we just ordered a new one
        clearTimeout(_this.collisionTimeout);

        // place label layout simulation into a queue
        _this.collisionTimeout = setTimeout(function () {
          //  _this.entityLabels.call(_this.collisionResolver.data(_this.cached));
        }, _this.model.time.speed * 1.2)
      }

    },

    //redraw Data Points
    _updateBubble: function (d, values, valuesL, index, view, duration) {

      var _this = this;
      var TIMEDIM = this.TIMEDIM;
      var KEY = this.KEY;
      if (_this.model.time.lockNonSelected && _this.someSelected && !_this.model.entities.isSelected(d)) {
        values = valuesL;
      }

      var valueY = values.axis_y[d[KEY]];
      var valueX = values.axis_x[d[KEY]];
      var valueS = values.size[d[KEY]];
      var valueL = values.label[d[KEY]];
      var valueC = values.color[d[KEY]];

      // check if fetching data succeeded
      //TODO: what if values are ACTUALLY 0 ?
      if (!valueL || !valueY || !valueX || !valueS) {
        // if entity is missing data it should hide
        view.classed("vzb-invisible", true)

      } else {

        // if entity has all the data we update the visuals
        var scaledS = utils.areaToRadius(_this.sScale(valueS));

        view.classed("vzb-invisible", false)
            .style("fill", _this.cScale(valueC));


        if(duration) {
          view.transition().duration(duration).ease("linear")
              .attr("cy", _this.yScale(valueY))
              .attr("cx", _this.xScale(valueX))
              .attr("r", scaledS);
        }
        else {
          view.attr("cy", _this.yScale(valueY))
              .attr("cx", _this.xScale(valueX))
              .attr("r", scaledS);
          // fix for #407 & #408
          d3.timer.flush();
        }

        if(this.model.time.record) _this._export.write({
            type: "circle",
            id: d[KEY],
            time: this.model.time.value.getFullYear(),
            fill: _this.cScale(valueC),
            cx: _this.xScale(valueX),
            cy: _this.yScale(valueY),
            r: scaledS
        });

        _this._updateLabel(d, index, valueX, valueY, scaledS, valueL, duration);

      } // data exists
    },


    _updateLabel: function (d, index, valueX, valueY, scaledS, valueL, duration) {
      var _this = this;
      var KEY = this.KEY;
      if (d[KEY] == _this.druging)
      	return;

      if (duration == null) duration = _this.duration;

      // only for selected entities
      if (_this.model.entities.isSelected(d) && _this.entityLabels != null) {

        if (_this.cached[d[KEY]] == null) _this.cached[d[KEY]] = {};
        var cached = _this.cached[d[KEY]];


        var select = utils.find(_this.model.entities.select, function (f) {
          return f[KEY] == d[KEY]
        });
        var trailStartTime = _this.timeFormatter.parse("" + select.trailStartTime);

        cached.valueX = valueX;
        cached.valueY = valueY;

        if (!_this.model.time.trails || trailStartTime - _this.time > 0 || select.trailStartTime == null) {

          select.trailStartTime = _this.timeFormatter(_this.time);
          //the events in model are not triggered here. to trigger uncomment the next line
          //_this.model.entities.triggerAll("change:select");

          cached.scaledS0 = scaledS;
          cached.labelX0 = valueX;
          cached.labelY0 = valueY;
        }

        if (cached.scaledS0 == null || cached.labelX0 == null || cached.labelX0 == null) {
          cached.scaledS0 = scaledS;
          cached.labelX0 = valueX;
          cached.labelY0 = valueY;
        }

        var lineGroup = _this.entityLines.filter(function (f) {
          return f[KEY] == d[KEY];
        });
        // reposition label
        _this.entityLabels.filter(function (f) {
          return f[KEY] == d[KEY]
        })
          .each(function (groupData) {

            var labelGroup = d3.select(this);

            var text = labelGroup.selectAll("text.vzb-bc-label-content")
              .text(valueL + (_this.model.time.trails ? " " + select.trailStartTime : ""));

            lineGroup.select("line").style("stroke-dasharray", "0 " + (cached.scaledS0 + 2) + " 100%");

            var rect = labelGroup.select("rect");

            var contentBBox = text[0][0].getBBox();
            if (!cached.contentBBox || cached.contentBBox.width != contentBBox.width) {
              cached.contentBBox = contentBBox;

              labelGroup.select("text.vzb-bc-label-x")
                .attr("x", contentBBox.height * 0.0 + 4)
                .attr("y", contentBBox.height * -1);

              labelGroup.select("circle")
                .attr("cx", contentBBox.height * 0.0 + 4)
                .attr("cy", contentBBox.height * -1)
                .attr("r", contentBBox.height * 0.5);

              rect.attr("width", contentBBox.width + 8)
                .attr("height", contentBBox.height * 1.2)
                .attr("x", -contentBBox.width -4)
                .attr("y", -contentBBox.height*0.85)
                .attr("rx", contentBBox.height * 0.2)
                .attr("ry", contentBBox.height * 0.2);
            }

            cached.labelX_ = select.labelOffset[0] || (-cached.scaledS0*0.75 - 5) / _this.width;
            cached.labelY_ = select.labelOffset[1] || (-cached.scaledS0*0.75 - 11) / _this.height;

            var limitedX = _this.xScale(cached.labelX0) + cached.labelX_ * _this.width;
            if (limitedX - cached.contentBBox.width <= 0) { //check left
              cached.labelX_ = select.labelOffset[0] || (cached.scaledS0*0.75 + cached.contentBBox.width + 10) / _this.width;
              limitedX = _this.xScale(cached.labelX0) + cached.labelX_ * _this.width;
            } else if (limitedX + 15 > _this.width) {//check right
              cached.labelX_ = (_this.width - 15 - _this.xScale(cached.labelX0))/_this.width;
              limitedX = _this.xScale(cached.labelX0) + cached.labelX_ * _this.width;
            }
            var limitedY = _this.yScale(cached.labelY0) + cached.labelY_ * _this.height;
            if (limitedY - cached.contentBBox.height <= 0 ) { // check top
              cached.labelY_ = select.labelOffset[1] || (cached.scaledS0*0.75 + cached.contentBBox.height) / _this.height;
              limitedY = _this.yScale(cached.labelY0) + cached.labelY_ * _this.height;
            } else if (limitedY + 10 > _this.height) { //check bottom
              cached.labelY_ = (_this.height - 10 - _this.yScale(cached.labelY0))/_this.height;
              limitedY = _this.yScale(cached.labelY0) + cached.labelY_ * _this.height;
            }

/*
            var limitedX = resolvedX - cached.contentBBox.width > 0 ? (resolvedX < _this.width ? resolvedX : _this.width) : cached.contentBBox.width;
            var limitedY = resolvedY - cached.contentBBox.height > 0 ? (resolvedY < _this.height ? resolvedY : _this.height) : cached.contentBBox.height;
*/

            var limitedX0 = _this.xScale(cached.labelX0);
            var limitedY0 = _this.yScale(cached.labelY0);

            _this._repositionLabels(d, index, this, limitedX, limitedY, limitedX0, limitedY0, duration, lineGroup);

          })
      } else {
        //for non-selected bubbles
        //make sure there is no cached data
        if (_this.cached[d[KEY]] != null) {
          _this.cached[d[KEY]] = void 0;
        }
      }
    },

    _repositionLabels: function (d, i, context, resolvedX, resolvedY, resolvedX0, resolvedY0, duration, lineGroup) {

      var cache = this.cached[d[this.KEY]];

      var labelGroup = d3.select(context);

      var width = parseInt(labelGroup.select("rect").attr("width"));
      var height = parseInt(labelGroup.select("rect").attr("height"));

      if (resolvedX - width <= 0) { //check left
        cache.labelX_ = (width - this.xScale(cache.labelX0))/this.width;
        resolvedX = this.xScale(cache.labelX0) + cache.labelX_ * this.width;
      } else if (resolvedX + 15 > this.width) {//check right
        cache.labelX_ = (this.width - 15 - this.xScale(cache.labelX0))/this.width;
        resolvedX = this.xScale(cache.labelX0) + cache.labelX_ * this.width;
      }
      if (resolvedY - height <= 0 ) { // check top
        cache.labelY_ = (height - this.yScale(cache.labelY0))/this.height;
        resolvedY = this.yScale(cache.labelY0) + cache.labelY_ * this.height;
      } else if (resolvedY + 13 > this.height) { //check bottom
        cache.labelY_ = (this.height - 13 - this.yScale(cache.labelY0))/this.height;
        resolvedY = this.yScale(cache.labelY0) + cache.labelY_ * this.height;
      }

      if(duration) {
        labelGroup
        .transition().duration(duration).ease("linear")
        .attr("transform", "translate(" + resolvedX + "," + resolvedY + ")");
        lineGroup.transition().duration(duration).ease("linear")
        .attr("transform", "translate(" + resolvedX + "," + resolvedY + ")");
      }
      else {
        labelGroup.attr("transform", "translate(" + resolvedX + "," + resolvedY + ")");
        lineGroup.attr("transform", "translate(" + resolvedX + "," + resolvedY + ")");
      }

      var diffX1 = resolvedX0 - resolvedX;
      var diffY1 = resolvedY0 - resolvedY;
      var diffX2 = 0;
      var diffY2 = 0;

      var angle = Math.atan2(diffX1 + width/2, diffY1 + height/2) * 180 / Math.PI;
      // middle bottom
      if(Math.abs(angle) <= 45){ diffX2 = width / 2; diffY2 = 0}
      // right middle
      if(angle>45 && angle<135){ diffX2 = 0; diffY2 = height/4; }
      // middle top
      if(angle < -45 && angle > -135){ diffX2 = width - 4; diffY2 = height/4;  }
      // left middle
      if(Math.abs(angle) >= 135){diffX2 = width / 2; diffY2 = height/2  }

      lineGroup.selectAll("line")
        .attr("x1", diffX1)
        .attr("y1", diffY1)
        .attr("x2", -diffX2)
        .attr("y2", -diffY2);

    },


    selectDataPoints: function () {
      var _this = this;
      var KEY = this.KEY;

      _this.someSelected = (_this.model.entities.select.length > 0);


      this.entityLabels = this.labelsContainer.selectAll('.vzb-bc-entity')
        .data(_this.model.entities.select, function (d) {
          return (d[KEY]);
        });
      this.entityLines = this.linesContainer.selectAll('.vzb-bc-entity')
        .data(_this.model.entities.select, function (d) {
          return (d[KEY]);
        });


      this.entityLabels.exit()
        .each(function (d) {
          _this._trails.run("remove", d);
        })
        .remove();
      this.entityLines.exit()
        .each(function (d) {
          _this._trails.run("remove", d);
        })
        .remove();
      this.entityLines
        .enter().append('g')
        .attr("class", "vzb-bc-entity")
        .call(_this.dragger)
        .each(function (d, index) {
           d3.select(this).append("line").attr("class", "vzb-bc-label-line");
        });

      this.entityLabels
        .enter().append("g")
        .attr("class", "vzb-bc-entity")
        .call(_this.dragger)
        .each(function (d, index) {
          var view = d3.select(this);

          view.append("rect")
            .on("click", function (d, i) {
              //default prevented is needed to distinguish click from drag
              if (d3.event.defaultPrevented) return;

              var maxmin = _this.cached[d[KEY]].maxMinValues;
              var radius = utils.areaToRadius(_this.sScale(maxmin.valueSmax));
              _this._zoomOnRectangle(_this.element,
                _this.xScale(maxmin.valueXmin) - radius,
                _this.yScale(maxmin.valueYmin) + radius,
                _this.xScale(maxmin.valueXmax) + radius,
                _this.yScale(maxmin.valueYmax) - radius,
                false, 500);
            });

          view.append("text").attr("class", "vzb-bc-label-content vzb-label-shadow");

          view.append("text").attr("class", "vzb-bc-label-content");

          view.append("circle").attr("class", "vzb-bc-label-x vzb-label-shadow vzb-transparent")
            .on("click", function (d, i) {
              _this.model.entities.clearHighlighted();
              //default prevented is needed to distinguish click from drag
              if (d3.event.defaultPrevented) return;
              _this.model.entities.selectEntity(d);
            });

          view.append("text").attr("class", "vzb-bc-label-x vzb-transparent").text("x");

          _this._trails.create(d);
        })
        .on("mousemove", function () {
          _this.model.entities.highlightEntity(this.__data__);
          d3.select(this).selectAll(".vzb-bc-label-x")
            .classed("vzb-transparent", false);
        })
        .on("mouseout", function (d) {
          _this.model.entities.clearHighlighted();
          d3.select(this).selectAll(".vzb-bc-label-x")
            .classed("vzb-transparent", true);
        });


    },


    _setTooltip: function (tooltipText, x, y, offset) {
      if (tooltipText) {
        var mouse = d3.mouse(this.graph.node()).map(function (d) {return parseInt(d)});
        var xPos, yPos, xSign = -1, ySign = -1, xOffset = 0, yOffset = 0;

        if (offset) {
          xOffset = offset * 0.71; // 0.71 - sin and cos for 315
          yOffset = offset * 0.71;
        }
        //position tooltip
        this.tooltip.classed("vzb-hidden", false)
          //.attr("style", "left:" + (mouse[0] + 50) + "px;top:" + (mouse[1] + 50) + "px")
          .selectAll("text")
          .text(tooltipText);

        var contentBBox = this.tooltip.select('text')[0][0].getBBox();
        if (x - xOffset - contentBBox.width < 0) {
          xSign = 1;
          x += contentBBox.width + 5;// corrective to the block Radius and text padding
        } else {
          x -= 5; // corrective to the block Radius and text padding
        }
        if (y - yOffset - contentBBox.height < 0) {
          ySign = 1;
          y += contentBBox.height;
        } else {
          y -= 11;// corrective to the block Radius and text padding
        }
        if (offset) {
          xPos = x + xOffset * xSign;
          yPos = y + yOffset * ySign; // 5 and 11 - corrective to the block Radius and text padding
        } else {
          xPos = x + xOffset * xSign;// 0.71 - sin and cos for 315
          yPos = y + yOffset * ySign; // 5 and 11 - corrective to the block Radius and text padding
        }
        this.tooltip.attr("transform", "translate(" + (xPos?xPos:mouse[0]) + "," + (yPos?yPos:mouse[1]) + ")")

        this.tooltip.select('rect').attr("width", contentBBox.width + 8)
                .attr("height", contentBBox.height * 1.2)
                .attr("x", -contentBBox.width -4)
                .attr("y", -contentBBox.height * 0.85)
                .attr("rx", contentBBox.height * 0.2)
                .attr("ry", contentBBox.height * 0.2);

      } else {
        this.tooltip.classed("vzb-hidden", true);
      }
    },

    /*
     * Shows and hides axis projections
     */
    _axisProjections: function (d) {
      if (d != null) {

        var valueY = this.model.marker.axis_y.getValue(d);
        var valueX = this.model.marker.axis_x.getValue(d);
        var valueS = this.model.marker.size.getValue(d);
        var radius = utils.areaToRadius(this.sScale(valueS));

        if (!valueY || !valueX || !valueS) return;

        if (this.ui.whenHovering.showProjectionLineX) {
          this.projectionX
            .style("opacity", 1)
            .attr("y2", this.yScale(valueY) + radius)
            .attr("x1", this.xScale(valueX))
            .attr("x2", this.xScale(valueX));
        }
        if (this.ui.whenHovering.showProjectionLineY) {
          this.projectionY
            .style("opacity", 1)
            .attr("y1", this.yScale(valueY))
            .attr("y2", this.yScale(valueY))
            .attr("x1", this.xScale(valueX) - radius);
        }

        if (this.ui.whenHovering.higlightValueX) this.xAxisEl.call(
          this.xAxis.highlightValue(valueX)
        );

        if (this.ui.whenHovering.higlightValueY) this.yAxisEl.call(
          this.yAxis.highlightValue(valueY)
        );

      } else {

        this.projectionX.style("opacity", 0);
        this.projectionY.style("opacity", 0);
        this.xAxisEl.call(this.xAxis.highlightValue("none"));
        this.yAxisEl.call(this.yAxis.highlightValue("none"));

      }

    },

    /*
     * Highlights all hovered bubbles
     */
    highlightDataPoints: function () {
      var _this = this;
      var TIMEDIM = this.TIMEDIM;

      this.someHighlighted = (this.model.entities.highlight.length > 0);

      this.updateBubbleOpacity();

      if (this.model.entities.highlight.length === 1) {
        var d = utils.clone(this.model.entities.highlight[0]);

        if (_this.model.time.lockNonSelected && _this.someSelected && !_this.model.entities.isSelected(d)) {
          d[TIMEDIM] = _this.timeFormatter.parse("" + _this.model.time.lockNonSelected);
        } else {
          d[TIMEDIM] = d.trailStartTime || _this.time;
        }

        this._axisProjections(d);
      } else {
        this._axisProjections();
      }
    },

    updateBubbleOpacity: function (duration) {
      var _this = this;
      //if(!duration)duration = 0;

      var OPACITY_HIGHLT = 1.0;
      var OPACITY_HIGHLT_DIM = 0.3;
      var OPACITY_SELECT = this.model.entities.opacityRegular;
      var OPACITY_REGULAR = this.model.entities.opacityRegular;
      var OPACITY_SELECT_DIM = this.model.entities.opacitySelectDim;

      this.entityBubbles
        //.transition().duration(duration)
        .style("opacity", function (d) {

          if (_this.someHighlighted) {
            //highlight or non-highlight
            if (_this.model.entities.isHighlighted(d)) return OPACITY_HIGHLT;
          }

          if (_this.someSelected) {
            //selected or non-selected
            return _this.model.entities.isSelected(d) ? OPACITY_SELECT : OPACITY_SELECT_DIM;
          }

          if (_this.someHighlighted) return OPACITY_HIGHLT_DIM;

          return OPACITY_REGULAR;
        });


      var someSelectedAndOpacityZero = _this.someSelected && _this.model.entities.opacitySelectDim < 0.01;

      // when pointer events need update...
      if (someSelectedAndOpacityZero != this.someSelectedAndOpacityZero_1) {
        this.entityBubbles.style("pointer-events", function (d) {
          return (!someSelectedAndOpacityZero || _this.model.entities.isSelected(d)) ?
            "visible" : "none";
        });
      }

      this.someSelectedAndOpacityZero_1 = _this.someSelected && _this.model.entities.opacitySelectDim < 0.01;
    },

    /*
     * Calculates all values for this data configuration
     */
    _calculateAllValues: function() {
      this.STEPS = this.model.time.getAllSteps();
      this.VALUES = {};
      var f = {};
      for (var i = 0; i < this.STEPS.length; i++) {
        var t = this.STEPS[i];
        f[this.TIMEDIM] = t;
        this.VALUES[t] = this.model.marker.getValues(f, [this.KEY]);
      }
    },

    /*
     * Gets all values for any point in time
     * @param {Date} t time value
     */
    _getValuesInterpolated: function(t) {

      if(!this.VALUES) this._calculateAllValues();
      if(this.VALUES[t]) return this.VALUES[t];

      var next = d3.bisectLeft(this.STEPS, t);

      //if first
      if(next === 0) {
        return this.VALUES[this.STEPS[0]];
      }
      if(next > this.STEPS.length) {
        return this.VALUES[this.STEPS[this.STEPS.length - 1]];
      }

      var fraction = (t - this.STEPS[next - 1]) / (this.STEPS[next] - this.STEPS[next - 1]);

      var pValues = this.VALUES[this.STEPS[next - 1]];
      var nValues = this.VALUES[this.STEPS[next]];

      var curr = {};
      utils.forEach(pValues, function(values, hook) {
        curr[hook] = {};
        utils.forEach(values, function(val, id) {
          var val2 = nValues[hook][id];
          curr[hook][id] = (!utils.isNumber(val)) ? val : val + ((val2 - val)*fraction);
        });
      });

      return curr;
    }

  });


}).call(this);
