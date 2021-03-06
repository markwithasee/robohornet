<?php

  // cleanup requested filepath
  $file = isset($_GET['f']) ? $_GET['f'] : 'benchmark';
  $file = preg_replace('#(\.*[\/])+#', '', $file);
  $file .= preg_match('/\.[a-z]+$/', $file) ? '' : '.js';

  // output filename
  if (isset($_GET['o'])) {
    $output = $_GET['o'];
  } else if (isset($_SERVER['argv'][1])) {
    $output = $_SERVER['argv'][1];
  } else {
    $output = basename($file);
  }

  /*--------------------------------------------------------------------------*/

  require('../vendor/docdown/docdown.php');

  // generate Markdown
  $markdown = docdown(array(
    'path' => '../' . $file,
    'title' => 'Benchmark.js <sup>v1.0.0-pre</sup>',
    'url'  => 'https://github.com/bestiejs/benchmark.js/blob/master/benchmark.js'
  ));

  // save to a .md file
  file_put_contents($output . '.md', $markdown);

  // print
  header('Content-Type: text/plain;charset=utf-8');
  echo $markdown . PHP_EOL;

?>