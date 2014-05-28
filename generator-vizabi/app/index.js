'use strict';
var util = require('util');
var path = require('path');
var yeoman = require('yeoman-generator');
var yosay = require('yosay');
var chalk = require('chalk');


var VizabiGenerator = yeoman.generators.Base.extend({
  init: function () {
  },

  askFor: function () {
    var done = this.async();

    // Have Yeoman greet the user.
    this.log(yosay('Welcome to the marvelous Vizabi generator!'));

    var vizabiPrompt = [{
      name: 'vizabiName',
      message: 'Name your new visualization:'
    }];

    var widgetPrompt = [{
      name: 'widgetName',
      message: 'Name your new widget:'
    }];

    var prompts = [{
      type: 'list',
      name: 'generateWhat',
      message: 'What do you want to create?',
      choices: [
        { name: 'A new Vizabi visualization', value: 'vizabi' },
        { name: 'A new Vizabi widget', value: 'widget' }
      ]
    }];

    this.prompt(prompts, function (props) {
      var that = this;
      this.generateWhat = props.generateWhat;

      if (this.generateWhat === 'vizabi') {
        this.prompt(vizabiPrompt, function (props2) {
          this.vizabiName = props2.vizabiName;
          done();
        }.bind(this));
      } else if (this.generateWhat === 'widget') {
        this.prompt(widgetPrompt, function (props2) {
          this.widgetName = props2.widgetName;
          done();
        }.bind(this));
      }
    }.bind(this));
  },

  app: function () {
    if (this.vizabiName) {
      var name = this.vizabiName;
      this.mkdir('visualizations/' + name);
      this.template('_vizabi_plain.js', 'visualizations/' + name + '/' + name + '.js');
      this.template('_vizabi_plain.scss', 'visualizations/' + name + '/' + name + '.scss');
    } else if (this.widgetName) {
      var name = this.widgetName;
      this.mkdir('widgets/' + name);
      this.template('_widget_plain.js', 'widgets/' + name + '/' + name + '.js');
      this.template('_widget_plain.scss', 'widgets/' + name + '/' + name + '.scss');
    }
  },

  projectfiles: function () {
  }
});

module.exports = VizabiGenerator;
