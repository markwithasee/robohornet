var robohornet = {};

robohornet.Status = {
  LOADING: 0,
  READY: 1,
  RUNNING: 2
};

robohornet.BenchmarkStatus = {
  NO_STATUS: -1,
  SUCCESS: 0,
  LOADING: 1,
  RUNNING: 2,
  PENDING: 3,
  LOAD_FAILED: 4,
  RUN_FAILED: 5,
  SKIPPED: 6,
  POPUP_BLOCKED: 7,
  ABORTED: 8,
  NON_CORE: 9
};

robohornet.TagType = {
  SPECIAL : 'special',
  TECHNOLOGY : 'technology',
  APP : 'app'
};


/**
 * Class representing a the RoboHornet test runner.
 *
 * @param {string} version String describing this version of the benchmark.
 * @param {Array.<Object>} benchmarks Array of benchmark json objects.
 * @constructor
 */
robohornet.Runner = function(version, benchmarks) {
  this.testsContainer = document.getElementById('tests');
  this.statusElement_ = document.getElementById('status');
  this.runElement_ = document.getElementById('runButton');
  this.progressElement_ = document.getElementById('progress');
  this.indexElement_ = document.getElementById('index');
  this.tagsElement_ = document.getElementById('tags');

  document.getElementById('index-prefix').textContent = version + ':';

  this.hasExtendedBenchmark_ = false;

  this.initBenchmarks_(benchmarks);
  this.init_();
  this.installBenchmarks_();
  this.digestHash_();

  this.setStatus_(robohornet.Status.READY);

  this.progressCallback_ = bind(this.progressTransitionDone_, this);

  window.addEventListener('unload', bind(this.onWindowUnload_, this), false);
};

(function() {

  var requestAnimationFrameFunction = window.mozRequestAnimationFrame ||
      window.msRequestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      window.oRequestAnimationFrame;

  var _p = robohornet.Runner.prototype;

  _p.init_ = function() {

    //If there are no benchmarks in the extended set, we pretend like it doesn't exist
    //Otherwise, it will basically behave the same as 'Core', which is confusing.
    var needExtended = this.hasExtendedBenchmark_;

    // First create the special core/extended/none tags.
    var coreTag = {
      name: 'CORE',
      prettyName: 'Core',
      type: robohornet.TagType.SPECIAL
    };

    var extendedTag = {
      name: "EXTENDED",
      prettyName: "Extended",
      type: robohornet.TagType.SPECIAL
    }

    var noneTag = {
      name: 'NONE',
      prettyName: 'None',
      type: robohornet.TagType.SPECIAL
    };

    // Pretend like the Core tag was added to every benchmark that's not in extended set.
    coreTag.benchmarks = [];
    extendedTag.benchmarks = this.benchmarks_;
    noneTag.benchmarks = [];

    for (var benchmark, i = 0; benchmark = this.benchmarks_[i]; i++) {
      if(!benchmark.extended) {
        benchmark.tags.push(coreTag);
        coreTag.benchmarks.push(benchmark);
      }
      if (needExtended) benchmark.tags.push(extendedTag);
    }

    // Put the core/extended/none tags first.
    var ele = this.makeTagElement_(coreTag);
    this.tagsElement_.appendChild(ele);
    coreTag.primaryElement = ele;

    if (needExtended) {
      ele = this.makeTagElement_(extendedTag);
      this.tagsElement_.appendChild(ele);
      extendedTag.primaryElement = ele;
    }

    ele = this.makeTagElement_(noneTag);
    this.tagsElement_.appendChild(ele);
    noneTag.primaryElement = ele;

    // First enumerate all technology tags...
    for (var tagName in TAGS) {
      var tag = TAGS[tagName];
      if (tag.type != robohornet.TagType.TECHNOLOGY) continue;
      var ele = this.makeTagElement_(tag);
      this.tagsElement_.appendChild(ele);
      tag.primaryElement = ele;
    }
    
    // Then all app tags.
    for (var tagName in TAGS) {
      var tag = TAGS[tagName];
      if (tag.type == robohornet.TagType.TECHNOLOGY) continue;
      var ele = this.makeTagElement_(tag);
      this.tagsElement_.appendChild(ele);
      tag.primaryElement = ele;
    }

    TAGS['CORE'] = coreTag;
    if (needExtended) TAGS['EXTENDED'] = extendedTag;
    TAGS['NONE'] = noneTag;

  };

  _p.run = function() {
    this.setStatus_(robohornet.Status.RUNNING);
    this.currentIndex_ = -1;
    this.score_ = 0;
    this.rawScore_ = 0;
    this.progressElement_.style.opacity = '0.1';
    this.statusElement_.textContent = 'Please wait while the benchmark runs. For best results, close all other programs and pages while the test is running.';
    window.setTimeout(bind(this.next_, this), 25);
  };

  _p.next_ = function() {
    var benchmark;
    while (!benchmark) {
      benchmark = this.benchmarks_[++this.currentIndex_];
      if (!benchmark)
        break;
      if (!benchmark.enabled) {
        this.setBenchmarkStatus_(benchmark, benchmark.extended ? robohornet.BenchmarkStatus.NON_CORE : robohornet.BenchmarkStatus.SKIPPED);
        benchmark = null;
      }
    }

    var progressAmount = (this.currentIndex_ / this.benchmarks_.length) * 100;
    this.progressElement_.style.marginLeft = "-" + (100 - progressAmount).toString() + "%";

    this.activeBenchmark_ = benchmark;
    if (benchmark) {
      this.loadBenchmark_(benchmark);
    } else {
      this.done_();
    }
  };

  _p.done_ = function() {
    this.progressElement_.addEventListener("webkitTransitionEnd", this.progressCallback_, false);
    this.progressElement_.addEventListener("transitionend", this.progressCallback_, false);
    this.progressElement_.style.opacity = '0.0';
    this.progressElement_.style.opacity = '0.0';

    var successfulRuns = 0, failedRuns = 0, blockedRuns = 0, nonCoreRuns = 0;
    for (var benchmark, i = 0; benchmark = this.benchmarks_[i]; i++) {
      if (benchmark.status == robohornet.BenchmarkStatus.SUCCESS)
        successfulRuns++;
      else if (benchmark.status == robohornet.BenchmarkStatus.NON_CORE)
        nonCoreRuns++;
      else if (benchmark.status == robohornet.BenchmarkStatus.POPUP_BLOCKED)
        blockedRuns++;
      else if (benchmark.status != robohornet.BenchmarkStatus.SKIPPED)
        failedRuns++;
    }

    if (successfulRuns + nonCoreRuns == this.benchmarks_.length) {
      this.setScore_(true /* opt_finalScore */);
      this.statusElement_.innerHTML = 'The RoboHornet index is normalized to 100 and roughly shows your browser\'s performance compared to other modern browsers on reference hardware. <a href="https://code.google.com/p/robohornet/wiki/BenchmarkScoring" target="_blank">Learn more</a>';
    } else if (blockedRuns) {
      this.statusElement_.textContent = "Your browser's popup blocker prevented some of the benchmarks from running. Disable your popup blocker and run the test again to see the index.";
    } else if (failedRuns) {
      this.statusElement_.textContent = failedRuns + ' out of ' + this.benchmarks_.length + ' benchmark(s) failed.';
    } else {
      this.statusElement_.textContent = 'Ran ' + successfulRuns + ' out of ' + this.benchmarks_.length + ' benchmarks. Enable all benchmarks to compute the index.';
    }
    this.setStatus_(robohornet.Status.READY);
  };

  _p.progressTransitionDone_ = function() {
    // Wait until the progress bar fades out to put it back to the left.
    this.progressElement_.style.marginLeft = "-100%";
    this.progressElement_.removeEventListener("webkitTransitionEnd", this.progressCallback_, false);
    this.progressElement_.removeEventListener("transitionend", this.progressCallback_, false);
  }

  _p.benchmarkLoaded = function() {
    var benchmark = this.activeBenchmark_;
    if (!benchmark)
      return;

    var self = this;
    var suite = new Benchmark.Suite(this.name, {
      onComplete: function() { self.onBenchmarkComplete_(this, benchmark); },
      onAbort: function() { self.onBenchmarkAbort_(this, benchmark); }
    });

    var callFunction = function(win, fn, arg, deferred) {
      win[fn] && win[fn].call(win, arg);
      if (fn == 'setUp' && win['resetMathRandom'])
        win['resetMathRandom']();
      if (deferred)
        deferred.resolve();
    };
          
    var callTest = function(win, arg, deferred) {
      if (win['testAsync']) {
        win['testAsync'].call(win, deferred, arg);
      }
      else if (win['test']) {
        win['test'].call(win, arg);
        if (deferred)
          deferred.resolve();
      }
      else
        this.abort();
    };

    var win = this.benchmarkWindow_;
    for (var run, i = 0; run = benchmark.runs[i]; i++) {
      var arg = run[1];
      suite.add(run[0], {
        defer: true,
        fn: bind(callTest, suite, win, arg),
        setup: bind(callFunction, suite, win, 'setUp', arg),
        teardown: bind(callFunction, suite, win, 'tearDown', arg)
      });
    }

    this.setBenchmarkStatus_(benchmark, robohornet.BenchmarkStatus.RUNNING);
    suite.run(true);
  };

  _p.initBenchmarks_ = function(benchmarks) {
    var totalWeight = 0;
    var benchmark;

    for (var details, i = 0; details = benchmarks[i]; i++) {
      totalWeight += details.weight;
    }

    this.benchmarks_ = [];
    this.benchmarksById_ = {};
    for (var details, i = 0; details = benchmarks[i]; i++) {
      benchmark = new robohornet.Benchmark(details);
      benchmark.index = i;
      benchmark.computedWeight = (benchmark.weight / totalWeight) * 100;
      this.benchmarks_.push(benchmark);
      this.benchmarksById_[benchmark.id] = benchmark;
      if (benchmark.extended) this.hasExtendedBenchmark_ = true;
      for (var tag, k = 0; tag = benchmark.tags[k]; k++) {
        if (tag.benchmarks) {
          tag.benchmarks.push(benchmark);
        } else {
          tag.benchmarks = [benchmark];
        }
      }
    }

  };

  _p.installBenchmarks_ = function() {
    for (var benchmark, i = 0; benchmark = this.benchmarks_[i]; i++) {
      this.registerBenchmark_(benchmark);
    }
    var finalRow = document.createElement("tr");
    finalRow.className = "summary-row";
    var cell = document.createElement("td");
    cell.colSpan = 5;
    cell.innerHTML = "<em>Raw score</em>";
    finalRow.appendChild(cell);
    cell = document.createElement("td");
    cell.className = "number";
    cell.textContent = "-";
    finalRow.appendChild(cell);
    this.rawScoreElement_ = cell;
    this.testsContainer.tBodies[0].appendChild(finalRow);
  };

  _p.loadBenchmark_ = function(benchmark) {
    if (this.benchmarkWindow_) {
      this.benchmarkWindow_.close();
      this.benchmarkWindow_ = null
    }

    this.setBenchmarkStatus_(benchmark, robohornet.BenchmarkStatus.LOADING);
    this.activeBenchmark_ = benchmark;

    //  We want to position the popup window on top, ideally with its bottom right corner in the bottom right of the screen.
    //  For most browsers and platforms, if we overshoot it's fine; the popup will be moved to be fully on screen.

    var TARGET_WINDOW_WIDTH = 800;
    var TARGET_WINDOW_HEIGHT = 600;

    var top = window.screen.availHeight + window.screen.availTop - TARGET_WINDOW_HEIGHT;
    var left = window.screen.availWidth + window.screen.availLeft - TARGET_WINDOW_WIDTH;

    this.benchmarkWindow_ = window.open(benchmark.filename + '?use_test_runner', 'robohornet',
        'left=' + left + ',top=' + top +
        ',width='+ TARGET_WINDOW_WIDTH + ',height=' + TARGET_WINDOW_HEIGHT);

    if (!this.benchmarkWindow_) {
      this.activeBenchmark_ = null;
      this.setBenchmarkStatus_(benchmark, robohornet.BenchmarkStatus.POPUP_BLOCKED);
      window.setTimeout(bind(this.next_, this), 25);
    }

  };

  _p.onBenchmarkAbort_ = function(suite, benchmark) {
      if (benchmark.status == robohornet.BenchmarkStatus.ABORTED)
        return;

      this.setBenchmarkStatus_(benchmark, robohornet.BenchmarkStatus.ABORTED);
      if (this.benchmarkWindow_)
        this.benchmarkWindow_.close();
      this.benchmarkWindow_ = null;
      window.setTimeout(bind(this.next_, this), 250);
  };

  _p.onBenchmarkComplete_ = function(suite, benchmark) {
    if (!this.benchmarkWindow_) {
      this.onBenchmarkAbort_(suite, benchmark);
      return;
    }
    
    this.benchmarkWindow_.close();
    this.benchmarkWindow_ = null;
    var results = [];
    for (var run, i = 0; run = suite[i]; i++) {
      results.push({
        name: run.name,
        mean: run.stats.mean * 1000,
        rme: run.stats.rme,
        runs: run.stats.sample.length
      });
    }
    benchmark.results = results;
    this.setBenchmarkStatus_(benchmark, robohornet.BenchmarkStatus.SUCCESS);
    this.showBenchmarkResults_(benchmark);
    window.setTimeout(bind(this.next_, this), 25);
  };

  _p.setBenchmarkEnabled_ = function(benchmark, enabled, opt_skipUpdateHash) {
    benchmark.toggleElement_.checked = enabled;
    this.onBenchmarkToggle_(benchmark, opt_skipUpdateHash);
  }

  _p.onBenchmarkToggle_ = function(benchmark, opt_skipUpdateHash) {
    benchmark.enabled = benchmark.toggleElement_.checked;
    if (benchmark.enabled) {
      benchmark.detailsElement_.classList.remove("disabled");
      benchmark.summaryRow_.classList.remove("disabled");
    } else {
      benchmark.detailsElement_.classList.add("disabled");
      benchmark.summaryRow_.classList.add("disabled");
    }
    //opt_skipUpdateHash may be a MouseEvent sometimes, but only skip if it's explicitly 'true'
    if (opt_skipUpdateHash != true)
      this.updateHash_();
  }

  _p.registerBenchmark_ = function(benchmark) {
    var identifier = 'benchmark-' + benchmark.index;

    // Append summary row.
    var row = document.createElement('tr');
    row.id = identifier;

    var cell = document.createElement('td');
    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = identifier + '-toggle';
    checkbox.checked = true;
    checkbox.addEventListener('click', bind(this.onBenchmarkToggle_, this, benchmark), false);
    cell.appendChild(checkbox);
    benchmark.toggleElement_ = checkbox;

    var label = document.createElement('span');
    label.appendChild(document.createTextNode(benchmark.name));
    label.addEventListener('click', bind(this.toggleBenchmarkDetails_, this, benchmark), false);
    cell.appendChild(label);

    row.appendChild(cell);

    addCell(row, '-');
    addCell(row, '-', 'number');
    addCell(row, benchmark.baselineTime.toFixed(2) + 'ms', 'number');
    addCell(row, benchmark.computedWeight.toFixed(2) + '%', 'number');
    addCell(row, '-', 'number');
    this.testsContainer.tBodies[0].appendChild(row);
    benchmark.summaryRow_ = row;

    // Append details row.
    row = document.createElement('tr');
    cell = document.createElement('td');
    cell.className = 'details';
    cell.colSpan = 7;

    var detailsElement = document.createElement('div');
    detailsElement.className = '';
    cell.appendChild(detailsElement);
    detailsElement.appendChild(document.createTextNode(benchmark.description));
    detailsElement.appendChild(document.createElement("br"));

    var issueLink = document.createElement("a");
    issueLink.href = "http://github.com/robohornet/robohornet/issues/" + benchmark.issueNumber;
    issueLink.target = "_blank";
    issueLink.appendChild(document.createTextNode("View issue details on GitHub"));
    detailsElement.appendChild(issueLink);
    detailsElement.appendChild(document.createElement("br"));

    if (benchmark.extended)
      detailsElement.appendChild(this.makeTagElement_(TAGS['EXTENDED']));
    for (var tag, i = 0; tag = benchmark.tags[i]; i++) {
      if (tag.type == robohornet.TagType.SPECIAL) continue;
      detailsElement.appendChild(this.makeTagElement_(tag));
    }

    // Append list of runs/parameters.
    var runsTable = document.createElement('table');
    runsTable.id = identifier + '-runs';
    runsTable.className = 'runs';
    runsTable.appendChild(document.createElement('thead'));

    var headerRow = document.createElement('tr');
    addCell(headerRow, 'Parameters');
    addCell(headerRow, 'Runs', 'number');
    addCell(headerRow, 'Error', 'number');
    addCell(headerRow, 'Mean', 'number');
    runsTable.tHead.appendChild(headerRow);

    runsTable.appendChild(document.createElement('tbody'));
    for (i = 0; i < benchmark.runs.length; i++) {
      var runsRow = document.createElement('tr');
      addCell(runsRow, benchmark.runs[i][0], 'name');
      addCell(runsRow, '0', 'number');
      addCell(runsRow, '0', 'number');
      addCell(runsRow, '0', 'number');
      runsTable.tBodies[0].appendChild(runsRow);
    }
    detailsElement.appendChild(runsTable);
    var linkElement = document.createElement('a');
    linkElement.target = '_new';
    linkElement.href = benchmark.filename;
    linkElement.appendChild(document.createTextNode('Open test in new window'));
    detailsElement.appendChild(linkElement);
    benchmark.detailsElement_ = detailsElement;

    row.appendChild(cell);
    this.testsContainer.tBodies[0].appendChild(row);
    row.className = 'details';
  };

  _p.showBenchmarkResults_ = function(benchmark) {
    var results = benchmark.results;

    var row = benchmark.summaryRow_;
    row.cells[1].textContent = 'Computing Index...';

    var accumulatedMean = 0;
    var runsTable = document.getElementById(row.id + '-runs');
    for (var result, i = 0; result = results[i]; i++) {
      var runCells = runsTable.tBodies[0].rows[i].cells;
      runCells[1].textContent = result.runs;
      runCells[2].textContent = String.fromCharCode(177) +
          result.rme.toFixed(2) + '%';
      runCells[3].textContent = result.mean.toFixed(2) + 'ms';
      accumulatedMean += result.mean;
    }

    var diff = accumulatedMean - benchmark.baselineTime;
    var score = benchmark.baselineTime * benchmark.computedWeight / accumulatedMean;
    this.score_ += score;
    var rawScore = accumulatedMean * benchmark.computedWeight;
    this.rawScore_ += rawScore;

    this.setScore_();

    row.cells[1].textContent = 'Completed successfully ';
    row.cells[2].textContent = accumulatedMean.toFixed(2) + 'ms';
    row.cells[5].textContent = score.toFixed(2);
  };


  _p.setBenchmarkStatus_ = function(benchmark, status) {
    benchmark.status = status;
    switch (benchmark.status) {
      case robohornet.BenchmarkStatus.SUCCESS:
        caption = 'Completed successfully';
        break;
      case robohornet.BenchmarkStatus.LOADING:
        caption = 'Loading...';
        break;
      case robohornet.BenchmarkStatus.RUNNING:
        caption = 'Running...';
        break;
      case robohornet.BenchmarkStatus.PENDING:
        caption = 'Pending';
        break;
      case robohornet.BenchmarkStatus.LOAD_FAILED:
        caption = 'Failed to load';
        break;
      case robohornet.BenchmarkStatus.RUN_FAILED:
        caption = 'Failed to run';
        break;
      case robohornet.BenchmarkStatus.SKIPPED:
        caption = 'Skipped';
        break;
      case robohornet.BenchmarkStatus.POPUP_BLOCKED:
        caption = 'Benchmark window blocked';
        break;
      case robohornet.BenchmarkStatus.ABORTED:
        caption = 'Aborted by user';
        break;
      case robohornet.BenchmarkStatus.NON_CORE:
        caption = "Not a part of the core suite"
        break;
      case robohornet.BenchmarkStatus.NO_STATUS:
        caption = '-';
        break;
      default:
        caption = 'Unknown failure';
    }

    var row = benchmark.summaryRow_;
    row.cells[1].textContent = caption;
  };

  _p.setStatus_ = function(status) {
    this.status_ = status;
    switch (this.status_) {
      case robohornet.Status.READY:
        caption = 'Run';
        break;
      case robohornet.Status.RUNNING:
        caption = 'Running...';
        break;
      default:
        caption = 'Loading...';
    }

    for (var benchmark, i = 0; benchmark = this.benchmarks_[i]; i++) {
      benchmark.toggleElement_.disabled = status == robohornet.Status.RUNNING;
      if (status == robohornet.Status.RUNNING)
        this.setBenchmarkStatus_(benchmark, robohornet.BenchmarkStatus.PENDING);
    }

    document.body.className = this.status_ == robohornet.Status.READY ? 'ready' : 'running';
    this.runElement_.textContent = caption;
    this.runElement_.disabled = this.status_ != robohornet.Status.READY;
  };

  _p.setScore_ = function(opt_finalScore) {
    // Ensure that we have 4 digits in front of the dot and 2 after.
    var parts = (Math.round(this.score_ * 100) / 100).toString().split('.');
    if (parts.length < 2)
      parts.push('00');
    while (!opt_finalScore && parts[0].length < 3) {
      parts[0] = '0' + parts[0];
    }
    while (parts[1].length < 2) {
      parts[1] = parts[1] + '0';
    }
    this.indexElement_.textContent = '';
    this.indexElement_.textContent = parts.join('.');
    this.indexElement_.className = opt_finalScore ? 'final' : '';
    this.rawScoreElement_.textContent = this.rawScore_.toFixed(2);
    if (opt_finalScore) {
      this.rawScoreElement_.classList.add('final');
    } else {
      this.rawScoreElement_.classList.remove('final');
    }
  }

  _p.toggleBenchmarkDetails_ = function(benchmark, e) {
    var rowEle = benchmark.detailsElement_.parentElement.parentElement;
    rowEle.classList.toggle("expanded");
    benchmark.summaryRow_.classList.toggle("expanded");
  };

  _p.enableAllBenchmarks = function() {
    for (var benchmark, i = 0; benchmark = this.benchmarks_[i]; i++) {
      this.setBenchmarkEnabled_(benchmark, true, true);
    }
    this.updateHash_();
  }

  _p.disableAllBenchmarks = function(opt_skipUpdateHash) {
    for (var benchmark, i = 0; benchmark = this.benchmarks_[i]; i++) {
      this.setBenchmarkEnabled_(benchmark, false, true);
    }
    if (opt_skipUpdateHash != true)
      this.updateHash_();
  }

  _p.makeTagElement_ = function(tag) {
      var tagElement = document.createElement("span");
      tagElement.className = "tag " + tag.type;
      tagElement.appendChild(document.createTextNode(tag.prettyName));
      var self = this;
      var func = function(evt) {
        if (evt.shiftKey) {
          self.addBenchmarksToSelectionByTag(tag);
        } else {
          self.selectBenchmarksByTag(tag);
        }
        // Undo the text selection from a shift-click.
        window.getSelection().removeAllRanges();
      }
      tagElement.addEventListener('click', func, false);
      return tagElement;
  }

  _p.selectBenchmarksByTag = function(tagToSelect) {
    this.disableAllBenchmarks(true);
    this.addBenchmarksToSelectionByTag(tagToSelect);
  }

  _p.addBenchmarksToSelectionByTag = function(tagToSelect) {
    for (var benchmark, i = 0; benchmark = this.benchmarks_[i]; i++) {
      for (var tag, k = 0; tag = benchmark.tags[k]; k++) {
        if (tag == tagToSelect) {
          this.setBenchmarkEnabled_(benchmark, true, true);
          break;
        }
      }
    }
    this.updateHash_();
  }

  _p.updateTagSelection_ = function() {
    for(var tagName in TAGS) {
      var tag = TAGS[tagName];
      var isActive = false, isFullyActive = true;
      if (tag.benchmarks.length == 0 && tag.type == robohornet.TagType.SPECIAL) {
        // Special case the none case.
        isFullyActive = true;
        for (var benchmark, i = 0; benchmark = this.benchmarks_[i]; i++) {
          if (benchmark.enabled) {
            isFullyActive = false;
            break;
          }
        }
      } else {
        for (var benchmark, i = 0; benchmark = tag.benchmarks[i]; i++) {
          if (benchmark.enabled) {
            isActive = true;
          } else {
            isFullyActive = false;
          }
        }
      }
      if (isFullyActive) {
        tag.primaryElement.classList.remove('partially-inactive');
        tag.primaryElement.classList.remove('inactive');
      } else if (isActive) {
        tag.primaryElement.classList.add('partially-inactive');
        tag.primaryElement.classList.remove('inactive');
      } else {
        tag.primaryElement.classList.remove('partially-inactive');
        tag.primaryElement.classList.add('inactive');
      }
    }
  }

  _p.updateHash_ = function() {
    //We'll keep track of how many benchmarks each of the tag has enabled.
    var enabledTagCount = {};
    var enabledBenchmarkIDs = [];
    var disabledBenchmarkIDs = [];
    for (var benchmark, i = 0; benchmark = this.benchmarks_[i]; i++) {
      if (benchmark.enabled) {
        enabledBenchmarkIDs.push(benchmark.id);
        for (var tag, k = 0; tag = benchmark.tags[k]; k++) {
          enabledTagCount[tag.name] = (enabledTagCount[tag.name] || 0) + 1;
        }
      }
      else {
        disabledBenchmarkIDs.push(benchmark.id);
      }
    }

    if (enabledBenchmarkIDs.length == 0) {
      window.location.hash = "#et=none";
      this.updateTagSelection_();
      return;
    }
    
    var maxTagName = "NONE"
    var maxTagCount = 0;

    //See which of the tags has the most coverage.
    for (var tagName in enabledTagCount) {
      if (enabledTagCount[tagName] < TAGS[tagName].benchmarks.length) {
        //This tag doesn't ahve full coverage so it can't be the best answer.
        continue;
      }
      if (enabledTagCount[tagName] > maxTagCount) {
        maxTagCount = enabledTagCount[tagName];
        maxTagName = tagName;
      }
    }

    //Check if that maxTagName has coverage of all enabled benchmarks.
    if (maxTagCount == enabledBenchmarkIDs.length) {
      if (maxTagName == "CORE") {
        //We don't need to explicitly enable it because it's enabled by default.
        window.location.hash = "";
      } else {
        window.location.hash = "#et=" + maxTagName.toLowerCase();
      }
    } else {
      //Okay, fall back on covering the benchmarks one by one, because no tag
      //covered all enabled benchmarks perfectly.

      // We want to encode as few IDs as possible in the hash.
      // This also gives us a good default to follow for new benchmarks.
      if (disabledBenchmarkIDs.length) {
        // At least one benchmark is disabled. Are the majority disabled?
        if (disabledBenchmarkIDs.length < enabledBenchmarkIDs.length) {
          window.location.hash = '#d=' + disabledBenchmarkIDs.join(',');
        } else {
          window.location.hash = '#e=' + enabledBenchmarkIDs.join(',');
        }
      } else {
        window.location.hash = '';
      }
    }
    this.updateTagSelection_();
  }

  _p.digestHash_ = function() {
    var hash = window.location.hash;

    if (!hash) {
      //The core set should be selected by default.
      this.selectBenchmarksByTag(TAGS['CORE']);
      return;
    }
    hash = hash.replace('#', '').toLowerCase().split('&');
    var enableBenchmarks;
    var benchmark;
    var segment;

    //First, checkx if "enabled-tags" is in, because we do special processing if it is.
    for (segment, i = 0; segment = hash[i]; i++) {
      hash[i] = hash[i].split('=');
      if (hash[i][0] == "et") {
        var tag = TAGS[hash[i][1].toUpperCase()];
        if (!tag) continue;
        this.selectBenchmarksByTag(tag);
        return;
      }
    }

    //There wasn't a single enabled tag. Let's see if there are any individual enabled/disabled benchmarks.
    for (var segment, i = 0; segment = hash[i]; i++) {
      
      enableBenchmarks = false;
      switch (hash[i][0]) {
        case 'e':
          enableBenchmarks = true;
          //We set all benchmarks to disable and then only enable some.
          for (var k = 0; benchmark = this.benchmarks_[k]; k++) {
            this.setBenchmarkEnabled_(benchmark, false, true);
          }
        case 'd':
          var ids = hash[i][1].split(',');
          for (var benchmarkID, j = 0; benchmarkID = ids[j]; j++) {
            benchmark = this.benchmarksById_[benchmarkID];
            if (!benchmark)
              continue;
            this.setBenchmarkEnabled_(benchmark, enableBenchmarks, true);
          }
          break;
      }
    }
    
    this.updateTagSelection_();
  }

  _p.onWindowUnload_ = function() {
    if (this.benchmarkWindow_)
      this.benchmarkWindow_.close();
  }

})();


/**
 * Class representing a single benchmark.
 *
 * @param {Object} details Benchmarks details as json object.
 * @constructor
 */
robohornet.Benchmark = function(details) {
  if (!details)
    details = {};
  this.name = details.name;
  this.description = details.description;
  this.filename = details.filename;
  this.runs = details.runs;
  this.weight = details.weight;
  this.baselineTime = details.baselineTime;
  this.tags = details.tags;
  this.issueNumber = details.issueNumber;
  this.enabled = true;
  this.extended = details.extended || false;

  this.id = this.filename.match(/\/([A-z]+)\./)[1].toLowerCase();
};

function bind(fn, opt_scope, var_args) {
  var scope = opt_scope || window;
  var len = arguments.length;
  var args = [];
  for (var i = 2; i < len; i++) {
    args.push(arguments[i]);
  }
  return function(arguments) {
    var a = args.slice();
    a.push.call(a, arguments);
    fn.apply(scope, a);
  };
}

function addCell(rowElement, textContent, opt_className) {
  var cell = document.createElement('td');
  if (opt_className)
    cell.className = opt_className;
  cell.appendChild(document.createTextNode(textContent));
  rowElement.appendChild(cell);
}
