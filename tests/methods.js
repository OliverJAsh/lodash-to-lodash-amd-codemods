/* eslint-disable */
// jscs:disable
define([
  'foo',
  "common/utils/_",
  'bar'
], function(
   foo,
   _,
   bar
) {
  x.foo;

  _.map();
  _.each();

  x.bar;
});

define(['foo'], function (foo) {});

define(function () {});

define({});
