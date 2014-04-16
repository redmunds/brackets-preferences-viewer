/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global window, define, brackets, $, Mustache, bindEvents */

define(function (require, exports, module) {
    "use strict";
    
    // Brackets modules
    var CommandManager      = brackets.getModule("command/CommandManager"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        ExtensionUtils      = brackets.getModule("utils/ExtensionUtils"),
        KeyBindingManager   = brackets.getModule("command/KeyBindingManager"),
        Menus               = brackets.getModule("command/Menus"),
        PanelManager        = brackets.getModule("view/PanelManager"),
        Resizer             = brackets.getModule("utils/Resizer");

    var prefsViewerHtml     = require("text!templates/prefs-viewer.html"),
        prefsContentHtml    = require("text!templates/prefs-content.html"),
        TOGGLE_VIEWER_ID    = "redmunds.prefs-viewer.view.prefs-viewer",
        HEADER_HEIGHT       = 27,
        templateData,
        baseObj,
        navState;

    var $prefsViewerPanel,
        $prefsViewerContent;

    function clearData() {
        baseObj      = {};
        navState     = [];
        templateData = {
            breadcrumbs: [],
            keyValueList: []
        };
    }

    // build templateData model from navState
    function buildModel() {
        var i,
            padLeft = 0,
            key,
            obj = (navState.length > 0) ? navState[navState.length - 1].obj : {},
            size,
            val;

        // start with fresh template data
        templateData = {
            breadcrumbs: [],
            keyValueList: []
        };

        // Build breadcrumbs while traversing object
        for (i = 0; i < navState.length; i++) {
            key = navState[i].key;
            padLeft += 20;

            templateData.breadcrumbs.push({
                crumbIndex: i,
                crumbText:  key,
                padLeft: padLeft.toString()
            });
        }

        // Build new key/value pairs list
        for (i in obj) {
            if (obj.hasOwnProperty(i)) {
                val = obj[i];
                if (typeof val === "object") {
                    val = "[Object]";
                } else if (typeof val  === "array") {
                    val = "[Array]";
                }

                templateData.keyValueList.push({
                    key:   i,
                    value: val
                });
            }
        }

        // add a dummy entry for empty object/array
        if (templateData.keyValueList.length === 0) {
            templateData.keyValueList.push({
                key:   "(empty)",
                value: ""
            });
        }
    }

    function getPrefsContentHtml() {
        // build templateData model from navState
        buildModel();

        // Generate html from model
        return Mustache.render(prefsContentHtml, templateData);
    }

    function updateDisplay() {
        // remove old markup
        $prefsViewerContent.empty();

        // build markup based on navSate and add it
        var $resizableContent = $prefsViewerPanel.find(".resizable-content");
        $resizableContent.append(getPrefsContentHtml());
    }

    // Initial display of viewer
    function showPrefsViewer() {

        var i, v;

        // start from scratch when viewer is first displayed to pick up
        // any changes to preferences from the last time it was displayed
        clearData();

        // init baseObj
        for (i in window.localStorage) {
            if (window.localStorage.hasOwnProperty(i)) {
                v = window.localStorage[i];
                baseObj[i] = (v.match(/\s*\{/)) ? JSON.parse(v) : v;
            }
        }

        // init navState
        navState.push({
            key: "window.localStorage",
            obj: baseObj
        });

        // build markup based on navState
        updateDisplay();

        // setup breadcrumb & key click events
        bindEvents();
    }

    function clickBreadCrumb(event) {
        var index = parseInt(event.target.dataset.index, 10),
            i;

        // range checking
        if (index < 0 || index >= (navState.length - 1)) {
            return;
        }

        // clicking on a breadcrumb causes 1 or more items to get popped off of the navState stack
        for (i = navState.length - 1; i > index; i--) {
            navState.pop();
        }

        // build markup based on navState
        updateDisplay();

        // setup breadcrumb & key click events
        bindEvents();
    }

    function clickKey(event) {
        var curObj = navState[navState.length - 1].obj,
            newObj = curObj[event.target.dataset.key];

        // only push object or array onto stack
        if (typeof newObj !== "object" && typeof newObj  !== "array") {
            return;
        }

        // clicking on a key causes item to get pushed onto the navState stack
        navState.push({
            key: event.target.dataset.key,
            obj: newObj
        });

        // build markup based on navState
        updateDisplay();

        // setup breadcrumb & key click events
        bindEvents();
    }
    
    function bindEvents() {
        var $breadcrumbs = $prefsViewerContent.find(".pv-breadcrumbs a"),
            $keys        = $prefsViewerContent.find(".pv-key a");

        // unbind existing events
        $breadcrumbs.off("click", function (event) {
            clickBreadCrumb(event);
        });
        $keys.off("click", function (event) {
            clickKey(event);
        });

        // bind events
        $breadcrumbs.on("click", function (event) {
            clickBreadCrumb(event);
        });
        $keys.on("click", function (event) {
            clickKey(event);
        });
    }

    function handleShowHidePrefsViewer() {
        if ($prefsViewerPanel.css("display") === "none") {
            CommandManager.get(TOGGLE_VIEWER_ID).setChecked(true);
            showPrefsViewer();
            $prefsViewerPanel.show();
        } else {
            $prefsViewerPanel.hide();
            clearData();
            CommandManager.get(TOGGLE_VIEWER_ID).setChecked(false);
        }
        EditorManager.resizeEditor();
    }

    function init() {
        var s         = Mustache.render(prefsViewerHtml),
            view_menu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU),
            panel;

        clearData();

        ExtensionUtils.loadStyleSheet(module, "viewer.css");

        // Register function as command
        CommandManager.register("Show Local Storage Viewer", TOGGLE_VIEWER_ID, handleShowHidePrefsViewer);

        // Add command to View menu, if it exists
        if (view_menu) {
            view_menu.addMenuItem(TOGGLE_VIEWER_ID);
        }

        // setup panel
        panel = PanelManager.createBottomPanel(TOGGLE_VIEWER_ID, $(s), 100);

        $prefsViewerPanel = $("#prefs-viewer");
        $prefsViewerContent = $prefsViewerPanel.find(".resizable-content");
        $prefsViewerPanel.hide();

        $prefsViewerPanel.find(".pv-close").click(function () {
            CommandManager.execute(TOGGLE_VIEWER_ID);
        });
    }

    init();
});
