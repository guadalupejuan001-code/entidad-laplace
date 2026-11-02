window.LAPLACE_XN02_EVIDENCE = {
  "schema": "laplace-xn02-native-window-study-v1",
  "dataset_sha256": "9239d6d29f9b415537d720e5aa87dc232d944352cae277c462fff1326e860713",
  "template_sha256": "c862a9ff371a3bd00c69ad5bee324e1c9f5c8ff6fc97edf80bac08f7facb2a68",
  "runtime": "mundo_x::QuantumRuntime; pinned original XI/Ether",
  "mundo_x_commit": "e2778d962af22f6f1a0794058dd4685fc2573966",
  "reverse_pc_commit": "45f7230bb6383f383c3bbea543f6199563f7cd32",
  "data_cutoff": "2026-10-30T18:05:00.000Z",
  "retrospective": true,
  "prospectively_validated": false,
  "stride_bars": 4,
  "target_bars": 1,
  "validation_cases": 64,
  "test_cases": 128,
  "selection_metric": "validation Brier; lower is better",
  "selected_window": 864,
  "windows": {
    "240": {
      "validation": {
        "cases": 64,
        "correct": 28,
        "accuracy": 0.4375,
        "brier": 0.26487746875,
        "prior_brier": 0.2531147878125,
        "coin_brier": 0.25,
        "confidence_bins": [
          {
            "from": 0.5,
            "to": 0.55,
            "cases": 32,
            "correct": 15
          },
          {
            "from": 0.55,
            "to": 0.6,
            "cases": 22,
            "correct": 10
          },
          {
            "from": 0.6,
            "to": 0.7,
            "cases": 10,
            "correct": 3
          },
          {
            "from": 0.7,
            "to": 1,
            "cases": 0,
            "correct": 0
          }
        ]
      },
      "test": {
        "cases": 128,
        "correct": 75,
        "accuracy": 0.5859375,
        "brier": 0.253245950078125,
        "prior_brier": 0.2504038053125,
        "coin_brier": 0.25,
        "confidence_bins": [
          {
            "from": 0.5,
            "to": 0.55,
            "cases": 54,
            "correct": 34
          },
          {
            "from": 0.55,
            "to": 0.6,
            "cases": 35,
            "correct": 21
          },
          {
            "from": 0.6,
            "to": 0.7,
            "cases": 37,
            "correct": 20
          },
          {
            "from": 0.7,
            "to": 1,
            "cases": 2,
            "correct": 0
          }
        ]
      }
    },
    "288": {
      "validation": {
        "cases": 64,
        "correct": 32,
        "accuracy": 0.5,
        "brier": 0.2619371878125,
        "prior_brier": 0.25250116171875,
        "coin_brier": 0.25,
        "confidence_bins": [
          {
            "from": 0.5,
            "to": 0.55,
            "cases": 37,
            "correct": 21
          },
          {
            "from": 0.55,
            "to": 0.6,
            "cases": 16,
            "correct": 6
          },
          {
            "from": 0.6,
            "to": 0.7,
            "cases": 11,
            "correct": 5
          },
          {
            "from": 0.7,
            "to": 1,
            "cases": 0,
            "correct": 0
          }
        ]
      },
      "test": {
        "cases": 128,
        "correct": 68,
        "accuracy": 0.53125,
        "brier": 0.25443495015625,
        "prior_brier": 0.25138129109375,
        "coin_brier": 0.25,
        "confidence_bins": [
          {
            "from": 0.5,
            "to": 0.55,
            "cases": 48,
            "correct": 25
          },
          {
            "from": 0.55,
            "to": 0.6,
            "cases": 46,
            "correct": 26
          },
          {
            "from": 0.6,
            "to": 0.7,
            "cases": 32,
            "correct": 17
          },
          {
            "from": 0.7,
            "to": 1,
            "cases": 2,
            "correct": 0
          }
        ]
      }
    },
    "864": {
      "validation": {
        "cases": 64,
        "correct": 34,
        "accuracy": 0.53125,
        "brier": 0.2493367121875,
        "prior_brier": 0.25020204734375,
        "coin_brier": 0.25,
        "confidence_bins": [
          {
            "from": 0.5,
            "to": 0.55,
            "cases": 44,
            "correct": 23
          },
          {
            "from": 0.55,
            "to": 0.6,
            "cases": 18,
            "correct": 10
          },
          {
            "from": 0.6,
            "to": 0.7,
            "cases": 2,
            "correct": 1
          },
          {
            "from": 0.7,
            "to": 1,
            "cases": 0,
            "correct": 0
          }
        ]
      },
      "test": {
        "cases": 128,
        "correct": 64,
        "accuracy": 0.5,
        "brier": 0.25573481546875,
        "prior_brier": 0.25030250265625,
        "coin_brier": 0.25,
        "confidence_bins": [
          {
            "from": 0.5,
            "to": 0.55,
            "cases": 92,
            "correct": 51
          },
          {
            "from": 0.55,
            "to": 0.6,
            "cases": 30,
            "correct": 10
          },
          {
            "from": 0.6,
            "to": 0.7,
            "cases": 6,
            "correct": 3
          },
          {
            "from": 0.7,
            "to": 1,
            "cases": 0,
            "correct": 0
          }
        ]
      }
    },
    "1440": {
      "validation": {
        "cases": 64,
        "correct": 27,
        "accuracy": 0.421875,
        "brier": 0.255574716875,
        "prior_brier": 0.24951220375,
        "coin_brier": 0.25,
        "confidence_bins": [
          {
            "from": 0.5,
            "to": 0.55,
            "cases": 56,
            "correct": 22
          },
          {
            "from": 0.55,
            "to": 0.6,
            "cases": 8,
            "correct": 5
          },
          {
            "from": 0.6,
            "to": 0.7,
            "cases": 0,
            "correct": 0
          },
          {
            "from": 0.7,
            "to": 1,
            "cases": 0,
            "correct": 0
          }
        ]
      },
      "test": {
        "cases": 128,
        "correct": 59,
        "accuracy": 0.4609375,
        "brier": 0.2546112675,
        "prior_brier": 0.24962437359375,
        "coin_brier": 0.25,
        "confidence_bins": [
          {
            "from": 0.5,
            "to": 0.55,
            "cases": 111,
            "correct": 50
          },
          {
            "from": 0.55,
            "to": 0.6,
            "cases": 13,
            "correct": 8
          },
          {
            "from": 0.6,
            "to": 0.7,
            "cases": 4,
            "correct": 1
          },
          {
            "from": 0.7,
            "to": 1,
            "cases": 0,
            "correct": 0
          }
        ]
      }
    }
  },
  "internal_confidence_is_accuracy": false,
  "automatic_trading": false,
  "limits": "One BTC period, overlapping training windows; no authenticated past vintages. 58% confidence is not 58% proven accuracy. Ties count as no upward movement."
};
